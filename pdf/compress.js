// Comprimir PDF — interface e modo "Imagens / escaneados". Carregado sob demanda por app.js.
// Usa window.QB (quebec 1.2.1): QB.drop recebe e valida o arquivo, QB.status mostra mensagens e erros.
// Modo estrutural: Web Worker (compress-worker.js) com pdf-lib (MIT) + CompressionStream('deflate').
// Modo imagens: PDF.js (Apache-2.0) renderiza cada página em <canvas>, JPEG via toBlob e reconstrução com pdf-lib (MIT).
import { PRESETS, MAX_BYTES, formatBytes, reductionPercent, formatPercent, renderScale, friendlyError } from './compress-core.js?v=1';

const WORKER_URL = new URL('./compress-worker.js?v=1', import.meta.url);
const WORKER_READY_TIMEOUT = 30000;
const MODE_HELP = {
  structural: 'Remove dados não utilizados e recompacta o conteúdo sem alterar o aspecto do documento. Ideal para PDFs com texto selecionável.',
  images: 'Renderiza cada página como imagem JPEG com a resolução escolhida. Indicado para documentos escaneados ou cheios de fotos.'
};

const userError = message => Object.assign(new Error(message), { userMessage: message });
const abortError = () => new DOMException('Operação cancelada', 'AbortError');
const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Modo estrutural em Web Worker. Cancelar = worker.terminate(). */
export function runStructural(buffer, { signal, onProgress }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    let worker, settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      if (worker) worker.terminate();
      fn(value);
    };
    const onAbort = () => finish(reject, abortError());
    const loadFailure = () => finish(reject, userError('Não foi possível carregar o processador de PDF em segundo plano. Confira sua conexão e atualize a página.'));
    const timer = setTimeout(loadFailure, WORKER_READY_TIMEOUT);
    signal.addEventListener('abort', onAbort, { once: true });
    try { worker = new Worker(WORKER_URL, { type: 'module' }); }
    catch { loadFailure(); return; }
    worker.addEventListener('error', event => { event.preventDefault(); loadFailure(); });
    worker.addEventListener('messageerror', () => finish(reject, userError('Falha na comunicação com o processador de PDF.')));
    worker.addEventListener('message', ({ data }) => {
      if (data.type === 'ready') { clearTimeout(timer); worker.postMessage({ type: 'run', buffer }, [buffer]); }
      else if (data.type === 'progress') onProgress(data);
      else if (data.type === 'done') finish(resolve, { bytes: data.bytes, stats: data.stats, pages: data.pages });
      else if (data.type === 'error') finish(reject, userError(data.message));
    });
  });
}

/** Modo imagens: uma página por vez, com liberação do canvas e da página após cada iteração. */
export async function compressImages({ pdfjs, PDFLib, buffer, preset, signal, onProgress }) {
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
  const destroyTask = () => task.destroy();
  signal.addEventListener('abort', destroyTask, { once: true });
  let pdf = null, canvas = document.createElement('canvas');
  try {
    pdf = await task.promise;
    const out = await PDFLib.PDFDocument.create();
    const total = pdf.numPages;
    for (let number = 1; number <= total; number++) {
      if (signal.aborted) throw abortError();
      onProgress({ stage: 'page', current: number, total });
      const page = await pdf.getPage(number);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: renderScale(base.width, base.height, preset.dpi) });
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        const render = page.render({ canvasContext: context, viewport });
        const stop = () => render.cancel();
        signal.addEventListener('abort', stop, { once: true });
        try { await render.promise; } finally { signal.removeEventListener('abort', stop); }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', preset.quality));
        if (!blob) throw userError(`Não foi possível gerar a imagem da página ${number}.`);
        const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        out.addPage([base.width, base.height]).drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      } finally {
        page.cleanup();
        canvas.width = canvas.height = 0; // libera o bitmap antes da próxima página
      }
      onProgress({ stage: 'page-done', current: number, total });
      await nextFrame(); // devolve o controle à interface
    }
    if (signal.aborted) throw abortError();
    onProgress({ stage: 'write' });
    return { bytes: await out.save({ useObjectStreams: true }), pages: total };
  } catch (err) {
    if (signal.aborted) throw abortError();
    throw err;
  } finally {
    signal.removeEventListener('abort', destroyTask);
    canvas.width = canvas.height = 0; canvas = null;
    if (pdf) await pdf.destroy().catch(() => {}); else task.destroy();
  }
}

export function mountCompressor({ getPdfjs }) {
  const $ = id => document.getElementById(id);
  const el = Object.fromEntries(['cmpDrop','cmpFile','cmpFiles','cmpFileName','cmpFileSize','cmpFileState','cmpRemove','cmpModeHelp','cmpPresetField',
    'cmpProgress','cmpProgressLabel','cmpProgressValue','cmpBar','cmpBarFill','cmpResult','cmpResultTitle','cmpResultName',
    'cmpDownload','cmpOriginal','cmpCompressed','cmpReduction','cmpOptimized','cmpDetails','cmpStatus','cmpCancel','cmpRun'].map(id => [id, $(id)]));
  const modeChips = [...document.querySelectorAll('[data-cmp-mode]')];
  const presetChips = [...document.querySelectorAll('[data-cmp-preset]')];
  const st = { file: null, mode: 'structural', preset: 'equilibrado', controller: null, url: null };

  const QB = window.QB;
  const status = (text, kind) => QB.status(el.cmpStatus, text, kind);
  const showError = text => status(text, 'error');
  const drop = QB.drop(el.cmpDrop, { maxBytes: MAX_BYTES, maxFiles: 1, status: el.cmpStatus, onFiles: files => setFile(files[0]) });

  function clearResult() {
    if (st.url) { URL.revokeObjectURL(st.url); st.url = null; }
    el.cmpDownload.removeAttribute('href');
    el.cmpResult.hidden = true; el.cmpOptimized.hidden = true; el.cmpDetails.hidden = true;
  }

  function setProgress(label, fraction) {
    el.cmpProgress.hidden = false;
    el.cmpProgressLabel.textContent = label;
    const indeterminate = fraction === null;
    el.cmpBar.classList.toggle('is-indeterminate', indeterminate);
    if (indeterminate) { el.cmpBarFill.style.width = ''; el.cmpProgressValue.textContent = ''; el.cmpBar.removeAttribute('aria-valuenow'); return; }
    const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    el.cmpBarFill.style.width = `${percent}%`;
    el.cmpProgressValue.textContent = `${percent}%`;
    el.cmpBar.setAttribute('aria-valuenow', String(percent));
  }

  function render() {
    const busy = Boolean(st.controller);
    modeChips.forEach(chip => { chip.setAttribute('aria-pressed', String(chip.dataset.cmpMode === st.mode)); chip.disabled = busy; });
    presetChips.forEach(chip => { chip.setAttribute('aria-pressed', String(chip.dataset.cmpPreset === st.preset)); chip.disabled = busy; });
    el.cmpPresetField.hidden = st.mode !== 'images';
    el.cmpModeHelp.textContent = MODE_HELP[st.mode];
    el.cmpFiles.hidden = !st.file;
    el.cmpDrop.hidden = Boolean(st.file);
    drop.busy(busy);
    el.cmpRemove.disabled = busy;
    el.cmpRun.disabled = busy || !st.file;
    el.cmpCancel.hidden = !busy;
    el.cmpCancel.disabled = busy && st.controller.signal.aborted;
    el.cmpFileState.textContent = busy ? 'Processando…' : st.file ? 'Pronto' : '';
    if (!busy) el.cmpProgress.hidden = true;
  }

  function setFile(file) {
    if (st.controller) return;
    clearResult();
    st.file = null;
    if (file) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) showError(`${file.name}: selecione um arquivo PDF.`);
      else if (file.size > MAX_BYTES) showError(`${file.name}: o arquivo excede 30 MB.`);
      else if (!file.size) showError(`${file.name}: o arquivo está vazio.`);
      else {
        st.file = file;
        el.cmpFileName.textContent = file.name; el.cmpFileName.title = file.name;
        el.cmpFileSize.textContent = formatBytes(file.size);
      }
    }
    if (st.file || !file) status(st.file ? 'Escolha o modo e clique em “Comprimir PDF”.' : 'Selecione um PDF para começar.');
    render();
  }

  function showResult(result) {
    const original = st.file.size, compressed = result.bytes.length;
    const optimized = compressed >= original;
    const base = st.file.name.replace(/\.pdf$/i, '').replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').slice(0, 80) || 'documento';
    st.url = URL.createObjectURL(optimized ? st.file : new Blob([result.bytes], { type: 'application/pdf' }));
    el.cmpDownload.href = st.url;
    el.cmpDownload.download = optimized ? st.file.name : `${base}-comprimido.pdf`;
    el.cmpDownload.querySelector('[data-qb-label]').textContent = optimized ? 'Baixar original' : 'Baixar PDF comprimido';
    el.cmpResultTitle.textContent = optimized ? 'Nenhuma redução obtida' : 'PDF comprimido';
    el.cmpResultName.textContent = el.cmpDownload.download;
    el.cmpOriginal.textContent = formatBytes(original);
    el.cmpCompressed.textContent = formatBytes(compressed);
    el.cmpReduction.textContent = optimized ? '0%' : formatPercent(reductionPercent(original, compressed));
    el.cmpOptimized.hidden = !optimized;
    const details = result.stats
      ? [plural(result.stats.removedObjects, 'objeto não utilizado removido', 'objetos não utilizados removidos'),
         plural(result.stats.recompressedStreams, 'conteúdo recomprimido', 'conteúdos recomprimidos'),
         plural(result.stats.removedThumbnails, 'miniatura removida', 'miniaturas removidas')].join(' · ')
      : `${plural(result.pages, 'página convertida', 'páginas convertidas')} a ${result.preset.dpi} DPI · qualidade JPEG ${Math.round(result.preset.quality * 100)}%`;
    el.cmpDetails.textContent = details; el.cmpDetails.hidden = false;
    el.cmpResult.hidden = false;
    status(optimized ? 'Este PDF já está otimizado.' : `Pronto: ${formatPercent(reductionPercent(original, compressed))} menor.`, 'ok');
  }

  async function run() {
    if (!st.file || st.controller) return;
    clearResult();
    const controller = new AbortController();
    st.controller = controller; render();
    setProgress('Lendo o arquivo…', null);
    status('Comprimindo… você pode cancelar a qualquer momento.');
    let buffer = null;
    try {
      buffer = await st.file.arrayBuffer();
      if (controller.signal.aborted) throw abortError();
      let result;
      if (st.mode === 'structural') {
        result = await runStructural(buffer, {
          signal: controller.signal,
          onProgress: p => p.stage === 'compress'
            ? setProgress(`Recomprimindo conteúdo ${p.current} de ${p.total}`, p.current / p.total)
            : setProgress({ read: 'Lendo a estrutura do PDF…', clean: 'Removendo dados não utilizados…', write: 'Gravando o PDF otimizado…' }[p.stage] || 'Processando…', null)
        });
      } else {
        const pdfjs = getPdfjs();
        if (!pdfjs || !window.PDFLib) throw userError('As bibliotecas PDF não carregaram. Confira sua conexão e atualize a página.');
        const preset = PRESETS[st.preset];
        result = await compressImages({
          pdfjs, PDFLib: window.PDFLib, buffer, preset, signal: controller.signal,
          onProgress: p => p.stage === 'write'
            ? setProgress('Montando o PDF…', 1)
            : setProgress(`Página ${p.current} de ${p.total}`, (p.stage === 'page-done' ? p.current : p.current - 1) / p.total)
        });
        result.preset = preset;
      }
      showResult(result);
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') status('Compressão cancelada. Nenhum arquivo foi gerado.');
      else showError(err?.userMessage || friendlyError(err));
    } finally {
      buffer = null;
      st.controller = null;
      render();
    }
  }

  function cancel() {
    if (!st.controller || st.controller.signal.aborted) return;
    st.controller.abort();
    setProgress('Cancelando…', null);
    render();
  }

  el.cmpRemove.addEventListener('click', () => setFile(null));
  el.cmpRun.addEventListener('click', run);
  el.cmpCancel.addEventListener('click', cancel);
  modeChips.forEach(chip => chip.addEventListener('click', () => { if (st.controller) return; st.mode = chip.dataset.cmpMode; clearResult(); render(); }));
  presetChips.forEach(chip => chip.addEventListener('click', () => { if (st.controller) return; st.preset = chip.dataset.cmpPreset; clearResult(); render(); }));
  render();

  return {
    isBusy: () => Boolean(st.controller),
    reset() { cancel(); setFile(null); }
  };
}
