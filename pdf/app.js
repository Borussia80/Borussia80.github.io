const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['files','drop','work','pages','count','fileInfo','status','clear','exportAll','exportSelected','exportPng','addMore','activePage','annotation','x','y','fontSize','color','askForm','question','conversation'].map(id => [id, $(id)]));
const state = { sources: [], pages: [], active: null, busy: false, pdfjs: null };
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 300;
const STOP = new Set('a o as os de da do das dos e em no na nos nas um uma para por com sobre que qual quais como onde quando quanto é são foi ser ao aos à às eu me meu minha este esta esse essa documento pdf página pag parte diz fala informe explique resumo faça favor'.split(' '));

function status(message, error = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', error);
}

function nameWithoutExt(name) { return name.replace(/\.[^.]+$/, ''); }
function filename(name) { return name.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').slice(0, 80); }
function download(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function updateControls() {
  const hasPages = state.pages.length > 0;
  elements.work.hidden = !hasPages;
  elements.count.textContent = state.pages.length;
  elements.fileInfo.textContent = `${state.sources.length} arquivo${state.sources.length === 1 ? '' : 's'} · marque as páginas para extrair`;
  elements.clear.disabled = !hasPages || state.busy;
  elements.exportAll.disabled = !hasPages || state.busy;
  elements.exportSelected.disabled = state.busy || !state.pages.some(page => page.selected);
  elements.exportPng.disabled = state.active === null || state.busy;
  elements.addMore.disabled = state.busy;
}

function setBusy(busy) {
  state.busy = busy;
  updateControls();
}

async function convertImage(file) {
  const bytes = await file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.create();
  const image = file.type === 'image/png' || /\.png$/i.test(file.name) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const margin = 28, maxWidth = 595 - margin * 2, maxHeight = 842 - margin * 2;
  const factor = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(72, image.width * factor + margin * 2);
  const height = Math.max(72, image.height * factor + margin * 2);
  doc.addPage([width, height]).drawImage(image, { x: margin, y: margin, width: image.width * factor, height: image.height * factor });
  return new Uint8Array(await doc.save());
}

async function addFiles(files) {
  if (!state.pdfjs || !window.PDFLib) { status('A biblioteca PDF não carregou. Verifique sua conexão e atualize a página.', true); return; }
  if (state.busy) return;
  setBusy(true);
  const errors = [];
  for (const file of files) {
    try {
      if (file.size > MAX_BYTES) throw Error('excede 30 MB');
      const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const image = /\.(png|jpe?g)$/i.test(file.name) || ['image/png','image/jpeg'].includes(file.type);
      if (!pdf && !image) throw Error('formato não aceito');
      const bytes = pdf ? new Uint8Array(await file.arrayBuffer()) : await convertImage(file);
      const document = await PDFLib.PDFDocument.load(bytes);
      const total = document.getPageCount();
      if (state.pages.length + total > MAX_PAGES) throw Error(`limite de ${MAX_PAGES} páginas atingido`);
      const reader = await state.pdfjs.getDocument({ data: bytes.slice() }).promise;
      const source = { name: file.name, document, reader, text: new Map() };
      state.sources.push(source);
      for (let i = 0; i < total; i++) state.pages.push({ source, index: i, rotation: 0, selected: false, annotation: null });
    } catch (err) {
      errors.push(`${file.name}: ${/password|encrypted/i.test(String(err)) ? 'PDF protegido por senha' : err.message || 'não foi possível abrir'}`);
    }
  }
  elements.files.value = '';
  setBusy(false);
  if (state.active === null && state.pages.length) state.active = state.pages[0];
  renderPages();
  status(errors.length ? errors.join(' · ') : `${state.pages.length} página${state.pages.length === 1 ? '' : 's'} pronta${state.pages.length === 1 ? '' : 's'} para edição.`, errors.length > 0);
}

async function thumbnail(page, canvas) {
  try {
    const pdfPage = await page.source.reader.getPage(page.index + 1);
    if (!canvas.isConnected) return;
    const angle = (pdfPage.rotate + page.rotation) % 360;
    const initial = pdfPage.getViewport({ scale: 1, rotation: angle });
    const viewport = pdfPage.getViewport({ scale: Math.min(1.2, 260 / Math.max(initial.width, initial.height)), rotation: angle });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  } catch { if (canvas.isConnected) canvas.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Preview indisponível', className: 'placeholder' })); }
}

function syncAnnotationForm() {
  const page = state.active;
  elements.activePage.textContent = page ? String(state.pages.indexOf(page) + 1) : 'nenhuma';
  const a = page?.annotation;
  elements.annotation.value = a?.text || '';
  elements.x.value = a?.x ?? 10;
  elements.y.value = a?.y ?? 15;
  elements.fontSize.value = a?.size ?? 16;
  elements.color.value = a?.color ?? '#162b47';
  updateControls();
}

function renderPages() {
  elements.pages.replaceChildren();
  const observer = new IntersectionObserver((records, obs) => {
    for (const record of records) if (record.isIntersecting) {
      const canvas = record.target.querySelector('canvas');
      const page = state.pages.find(p => p === record.target.pageRecord);
      if (canvas && page) thumbnail(page, canvas);
      obs.unobserve(record.target);
    }
  }, { rootMargin: '250px' });
  state.pages.forEach((page, position) => {
    const item = document.createElement('div'); item.className = `page${page === state.active ? ' active' : ''}`; item.pageRecord = page;
    const preview = document.createElement('div'); preview.className = 'preview'; preview.title = 'Ativar página e posicionar texto';
    const canvas = document.createElement('canvas'); preview.append(canvas);
    preview.addEventListener('click', event => {
      state.active = page;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width && bounds.height && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
        const x = Math.min(95, Math.max(0, Math.round((event.clientX - bounds.left) / bounds.width * 100)));
        const y = Math.min(100, Math.max(5, Math.round((event.clientY - bounds.top) / bounds.height * 100)));
        if (page.annotation) { page.annotation.x = x; page.annotation.y = y; }
        else { elements.x.value = x; elements.y.value = y; }
      }
      renderPages();
      if (!page.annotation) { elements.x.value = Math.min(95, Math.max(0, Math.round((event.clientX - bounds.left) / bounds.width * 100))); elements.y.value = Math.min(100, Math.max(5, Math.round((event.clientY - bounds.top) / bounds.height * 100))); }
      status(`Página ${state.pages.indexOf(page) + 1} ativa. Digite o texto para anotá-la.`);
    });
    const top = document.createElement('div'); top.className = 'page-top';
    const label = document.createElement('span'); label.title = page.source.name; label.textContent = `${position + 1} · ${page.source.name}`;
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = page.selected; check.setAttribute('aria-label', `Selecionar página ${position + 1}`);
    check.addEventListener('change', () => { page.selected = check.checked; updateControls(); });
    top.append(label, check);
    const actions = document.createElement('div'); actions.className = 'page-actions';
    for (const [title, icon, action] of [
      ['Mover para a esquerda','←', () => move(page, -1)], ['Mover para a direita','→', () => move(page, 1)],
      ['Girar 90 graus','⟳', () => { page.rotation = (page.rotation + 90) % 360; renderPages(); }],
      ['Remover página','×', () => { state.pages.splice(state.pages.indexOf(page), 1); if (state.active === page) state.active = state.pages[0] || null; renderPages(); }]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.title = title; button.textContent = icon; button.setAttribute('aria-label', `${title}: página ${position + 1}`);
      button.addEventListener('click', action); actions.append(button);
    }
    item.append(preview, top, actions); elements.pages.append(item); observer.observe(item);
  });
  syncAnnotationForm();
}

function move(page, offset) {
  const from = state.pages.indexOf(page), to = from + offset;
  if (to < 0 || to >= state.pages.length) return;
  [state.pages[from], state.pages[to]] = [state.pages[to], state.pages[from]];
  renderPages();
}

function saveAnnotation() {
  if (!state.active) return;
  const text = elements.annotation.value.trim();
  const x = Number(elements.x.value), y = Number(elements.y.value), size = Number(elements.fontSize.value);
  if (![x,y,size].every(Number.isFinite) || x < 0 || x > 95 || y < 5 || y > 100 || size < 8 || size > 48) { status('Confira posição e tamanho do texto.', true); return; }
  state.active.annotation = text ? { text, x, y, size, color: elements.color.value } : null;
  status(text ? 'Texto pronto para entrar no PDF exportado.' : 'Texto removido da página ativa.');
}

async function annotate(doc, page, annotation) {
  if (!annotation) return;
  const { width, height } = page.getSize();
  const size = annotation.size, x = width * annotation.x / 100, top = height * annotation.y / 100;
  const context = document.createElement('canvas').getContext('2d');
  context.font = `${size}px sans-serif`;
  const lines = [];
  for (const paragraph of annotation.text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > width - x - 10) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  for (let i = 0; i < lines.length; i++) {
    if (top + (i + 1) * size * 1.3 > height) break;
    const line = lines[i]; if (!line) continue;
    const visualWidth = Math.min(width - x - 4, context.measureText(line).width + 6);
    if (visualWidth <= 0) continue;
    const bitmap = document.createElement('canvas'); bitmap.width = Math.ceil(visualWidth * 2); bitmap.height = Math.ceil(size * 1.45 * 2);
    const ctx = bitmap.getContext('2d'); ctx.scale(2, 2); ctx.font = `${size}px sans-serif`; ctx.fillStyle = annotation.color;
    ctx.textBaseline = 'top'; ctx.fillText(line, 2, 1);
    const blob = await new Promise(resolve => bitmap.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Falha ao preparar o texto');
    const image = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
    page.drawImage(image, { x, y: height - top - (i + 1) * size * 1.3, width: visualWidth, height: size * 1.45 });
  }
}

async function compose(pages) {
  const result = await PDFLib.PDFDocument.create();
  for (const item of pages) {
    const [copied] = await result.copyPages(item.source.document, [item.index]);
    copied.setRotation(PDFLib.degrees((copied.getRotation().angle + item.rotation) % 360));
    result.addPage(copied);
    await annotate(result, copied, item.annotation);
  }
  return new Uint8Array(await result.save());
}

async function runExport(pages, suffix) {
  if (!pages.length || state.busy) return;
  setBusy(true); status('Preparando o PDF…');
  try {
    const bytes = await compose(pages);
    download(bytes, `quebec-pdf-${suffix}.pdf`, 'application/pdf');
    status(`PDF com ${pages.length} página${pages.length === 1 ? '' : 's'} pronto para baixar.`);
  } catch (err) { status(`Não foi possível criar o PDF: ${err.message}`, true); }
  finally { setBusy(false); }
}

async function exportPng() {
  if (!state.active || state.busy) return;
  setBusy(true); status('Renderizando a imagem…');
  try {
    const bytes = await compose([state.active]);
    const reader = await state.pdfjs.getDocument({ data: bytes }).promise;
    const page = await reader.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Falha ao gerar PNG');
    download(blob, `quebec-pagina-${state.pages.indexOf(state.active) + 1}.png`, 'image/png');
    await reader.destroy(); status('PNG pronto para baixar.');
  } catch (err) { status(`Não foi possível gerar a imagem: ${err.message}`, true); }
  finally { setBusy(false); }
}

async function pageText(item) {
  if (!item.source.text.has(item.index)) {
    const page = await item.source.reader.getPage(item.index + 1);
    const content = await page.getTextContent();
    item.source.text.set(item.index, content.items.map(entry => entry.str || '').join(' '));
  }
  return item.source.text.get(item.index);
}

function normalize(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function keywords(question) { return [...new Set(normalize(question).match(/[a-z0-9]{3,}/g)?.filter(word => !STOP.has(word)) || [])]; }
function message(role, text, page) {
  const div = document.createElement('div'); div.className = `message ${role}`; div.textContent = text;
  if (page) { const source = document.createElement('span'); source.className = 'source'; source.textContent = `Página ${page}`; div.append(source); }
  elements.conversation.append(div); elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

async function ask(question) {
  message('user', question);
  if (!state.pages.length) { message('assistant', 'Adicione um PDF para consultar o texto.'); return; }
  const terms = keywords(question);
  if (!terms.length) { message('assistant', 'Inclua palavras específicas na pergunta, como um nome, tema ou valor.'); return; }
  status('Consultando o texto das páginas…');
  try {
    const results = []; let hasText = false;
    for (let i = 0; i < state.pages.length; i++) {
      const text = (await pageText(state.pages[i])).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      hasText = true;
      for (const sentence of text.match(/.{1,280}(?:[.!?;]|$)/g) || [text]) {
        const normalized = normalize(sentence);
        const hits = terms.filter(term => normalized.includes(term));
        if (hits.length) results.push({ score: hits.length * 4 + terms.reduce((n, term) => n + normalized.split(term).length - 1, 0), text: sentence.trim().slice(0, 330), page: i + 1 });
      }
    }
    results.sort((a,b) => b.score - a.score);
    const unique = results.filter((r,i,all) => all.findIndex(x => x.text === r.text && x.page === r.page) === i).slice(0, 3);
    if (!hasText) message('assistant', 'Não encontrei texto selecionável. Este PDF pode ser digitalizado; faça OCR antes de consultá-lo.');
    else if (!unique.length) message('assistant', 'Não encontrei trechos com esses termos. Experimente palavras que apareçam no documento.');
    else { message('assistant', 'Encontrei estes trechos no documento:'); for (const result of unique) message('assistant', `“${result.text}”`, result.page); }
    status('Consulta concluída.');
  } catch (err) { message('assistant', `Não foi possível ler o texto: ${err.message}`); status('Falha ao consultar o PDF.', true); }
}

elements.files.addEventListener('change', event => addFiles([...event.target.files]));
elements.addMore.addEventListener('click', () => elements.files.click());
for (const event of ['dragenter','dragover']) elements.drop.addEventListener(event, e => { e.preventDefault(); elements.drop.classList.add('dragging'); });
for (const event of ['dragleave','drop']) elements.drop.addEventListener(event, e => { e.preventDefault(); elements.drop.classList.remove('dragging'); });
elements.drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
elements.clear.addEventListener('click', async () => { for (const source of state.sources) await source.reader.destroy(); state.sources = []; state.pages = []; state.active = null; renderPages(); status('Área de trabalho limpa.'); });
elements.exportAll.addEventListener('click', () => runExport(state.pages, 'completo'));
elements.exportSelected.addEventListener('click', () => runExport(state.pages.filter(page => page.selected), 'selecionadas'));
elements.exportPng.addEventListener('click', exportPng);
for (const id of ['annotation','x','y','fontSize','color']) elements[id].addEventListener('input', saveAnnotation);
elements.askForm.addEventListener('submit', async e => { e.preventDefault(); const question = elements.question.value.trim(); if (question) { elements.question.value = ''; await ask(question); } });
$('year').textContent = new Date().getFullYear();
updateControls();
try {
  if (!window.PDFLib) throw Error('pdf-lib indisponível');
  state.pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
  state.pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
  status('Pronto para receber seus arquivos.');
} catch (err) { status(`Não foi possível carregar as bibliotecas PDF: ${err.message}. Confira sua conexão e atualize a página.`, true); }
