const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['files','drop','work','pages','count','fileInfo','status','clear','exportAll','exportSelected','exportImages','imageFormat','imageScope','selectAll','selectNone','numberStart','numberPosition','addMore','activePage','annotation','x','y','fontSize','color','askForm','question','conversation','workspace','catalog','backToTools','workflowTitle','workflowDescription','dropTitle','dropHint','splitBox','splitRanges','exportSplit','tools'].map(id => [id, $(id)]));
const state = { sources: [], pages: [], active: null, busy: false, pdfjs: null, mode: 'merge' };
const workflows = {
  merge: ['Unir PDF', 'Adicione vários PDFs e organize as páginas antes de baixar.'],
  split: ['Dividir PDF', 'Indique os intervalos e baixe cada parte em um arquivo ZIP.'],
  organize: ['Organizar PDF', 'Mova páginas com as setas ou remova as que não quiser.'],
  extract: ['Extrair páginas', 'Marque as páginas desejadas e baixe um novo PDF.'],
  rotate: ['Girar PDF', 'Gire cada página pelo botão circular e baixe o resultado.'],
  imageToPdf: ['Imagem para PDF', 'Adicione JPG ou PNG e monte um PDF na ordem desejada.'],
  pdfToPng: ['PDF para imagem', 'Converta uma página ou várias em PNG ou JPG.'],
  edit: ['Adicionar texto', 'Clique na página e preencha o texto para incluir na cópia exportada.'],
  number: ['Numerar páginas', 'Escolha o número inicial e a posição antes de baixar.'],
  read: ['Perguntar ao PDF', 'Carregue um PDF com texto selecionável e procure trechos por tema.']
};
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 300;
const MAX_IMAGES = 100;
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
  const canSelect = ['extract','pdfToPng'].includes(state.mode);
  const canReorder = ['merge','organize','imageToPdf','number'].includes(state.mode);
  elements.fileInfo.textContent = `${state.sources.length} arquivo${state.sources.length === 1 ? '' : 's'} · ${canSelect ? 'marque as páginas que desejar' : canReorder ? 'arraste miniaturas ou use as setas' : 'clique na miniatura para escolher uma página'}`;
  elements.clear.disabled = !hasPages || state.busy;
  elements.exportAll.disabled = !hasPages || state.busy;
  elements.exportSelected.disabled = state.busy || !state.pages.some(page => page.selected);
  elements.exportImages.disabled = !hasPages || state.busy || (elements.imageScope.value === 'selected' && !state.pages.some(page => page.selected));
  elements.selectAll.hidden = elements.selectNone.hidden = !canSelect;
  elements.selectAll.disabled = state.busy || state.pages.every(page => page.selected);
  elements.selectNone.disabled = state.busy || !state.pages.some(page => page.selected);
  elements.exportSplit.disabled = !hasPages || state.busy;
  elements.addMore.hidden = !elements.files.multiple;
  elements.addMore.disabled = state.busy;
}

async function clearDocuments() {
  for (const source of state.sources) await source.reader.destroy();
  state.sources = []; state.pages = []; state.active = null;
  elements.files.value = ''; elements.splitRanges.value = '';
  renderPages();
}

async function openTool(mode) {
  if (state.busy || !workflows[mode]) return;
  if (state.mode !== mode && state.pages.length) await clearDocuments();
  state.mode = mode;
  const [title, description] = workflows[mode];
  elements.workflowTitle.textContent = title;
  elements.workflowDescription.textContent = description;
  const images = mode === 'imageToPdf';
  elements.files.accept = images ? 'image/png,image/jpeg,.png,.jpg,.jpeg' : 'application/pdf,.pdf';
  elements.files.multiple = !['split','pdfToPng','rotate','edit','read','extract','number'].includes(mode);
  elements.dropTitle.textContent = images ? 'Selecione imagens JPG ou PNG' : 'Selecione arquivos PDF';
  elements.dropHint.textContent = `${images ? 'JPG ou PNG' : 'PDF'} até 30 MB por arquivo`;
  elements.exportAll.textContent = images ? 'Converter para PDF' : mode === 'edit' ? 'Baixar PDF editado' : mode === 'number' ? 'Baixar PDF numerado' : 'Baixar PDF';
  elements.exportAll.hidden = ['split','extract','pdfToPng','read'].includes(mode);
  elements.exportSelected.hidden = mode !== 'extract';
  elements.splitBox.hidden = mode !== 'split';
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== mode;
  elements.tools.hidden = !['edit','read','pdfToPng','number'].includes(mode);
  elements.workspace.hidden = false;
  updateControls();
  status('Pronto para receber seus arquivos.');
  elements.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    let reader;
    try {
      if (file.size > MAX_BYTES) throw Error('excede 30 MB');
      const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const image = /\.(png|jpe?g)$/i.test(file.name) || ['image/png','image/jpeg'].includes(file.type);
      if (!pdf && !image) throw Error('formato não aceito');
      if (state.mode === 'imageToPdf' && !image || state.mode !== 'imageToPdf' && !pdf) throw Error('formato diferente da ferramenta escolhida');
      if (!elements.files.multiple && state.sources.length) throw Error('esta ferramenta aceita um arquivo por vez');
      const bytes = pdf ? new Uint8Array(await file.arrayBuffer()) : await convertImage(file);
      const document = await PDFLib.PDFDocument.load(bytes);
      const total = document.getPageCount();
      if (!total) throw Error('PDF sem páginas');
      if (state.pages.length + total > MAX_PAGES) throw Error(`limite de ${MAX_PAGES} páginas atingido`);
      reader = await state.pdfjs.getDocument({ data: bytes.slice() }).promise;
      const source = { name: file.name, document, reader, text: new Map() };
      state.sources.push(source);
      reader = null;
      for (let i = 0; i < total; i++) state.pages.push({ source, index: i, rotation: 0, selected: false, annotation: null });
    } catch (err) {
      if (reader) await reader.destroy();
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
    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'preview'; preview.setAttribute('aria-label', `Ativar página ${position + 1}`);
    const canvas = document.createElement('canvas'); preview.append(canvas);
    preview.addEventListener('click', event => {
      const bounds = canvas.getBoundingClientRect();
      const clickedCanvas = event.detail > 0 && bounds.width && bounds.height && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      const x = clickedCanvas ? Math.min(95, Math.max(0, Math.round((event.clientX - bounds.left) / bounds.width * 100))) : null;
      const y = clickedCanvas ? Math.min(100, Math.max(5, Math.round((event.clientY - bounds.top) / bounds.height * 100))) : null;
      state.active = page;
      renderPages();
      if (state.mode === 'edit' && x !== null) { elements.x.value = x; elements.y.value = y; if (page.annotation) saveAnnotation(); }
      status(`Página ${state.pages.indexOf(page) + 1} ativa.${state.mode === 'edit' ? ' Digite o texto para anotá-la.' : ''}`);
    });
    const top = document.createElement('div'); top.className = 'page-top';
    const label = document.createElement('span'); label.title = page.source.name; label.textContent = `${position + 1} · ${page.source.name}`;
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = page.selected; check.hidden = !['extract','pdfToPng'].includes(state.mode); check.setAttribute('aria-label', `Selecionar página ${position + 1}`);
    check.addEventListener('change', () => { page.selected = check.checked; updateControls(); });
    top.append(label, check);
    const actions = document.createElement('div'); actions.className = 'page-actions';
    for (const [title, icon, action] of [
      ['Mover para a esquerda','←', () => move(page, -1)], ['Mover para a direita','→', () => move(page, 1)],
      ['Girar 90 graus','⟳', () => { page.rotation = (page.rotation + 90) % 360; renderPages(); }],
      ['Remover página','×', () => { state.pages.splice(state.pages.indexOf(page), 1); if (state.active === page) state.active = state.pages[0] || null; renderPages(); }]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.title = title; button.textContent = icon; button.setAttribute('aria-label', `${title}: página ${position + 1}`);
      if (title === 'Mover para a esquerda') button.disabled = position === 0;
      if (title === 'Mover para a direita') button.disabled = position === state.pages.length - 1;
      button.addEventListener('click', action); actions.append(button);
    }
    if (['merge','organize','imageToPdf','number'].includes(state.mode)) {
      item.draggable = true; item.title = 'Arraste para mudar a ordem das páginas';
      item.addEventListener('dragstart', event => { state.dragged = page; event.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragend', () => { state.dragged = null; item.classList.remove('drag-over'); });
      item.addEventListener('dragover', event => { if (state.dragged && state.dragged !== page) { event.preventDefault(); item.classList.add('drag-over'); } });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', event => { event.preventDefault(); item.classList.remove('drag-over'); if (state.dragged && state.dragged !== page) { const from = state.pages.indexOf(state.dragged), to = state.pages.indexOf(page); state.pages.splice(from, 1); state.pages.splice(to, 0, state.dragged); renderPages(); status('Ordem das páginas atualizada.'); } state.dragged = null; });
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

function numberSettings() {
  const start = Number(elements.numberStart.value);
  if (!Number.isInteger(start) || start < 1 || start > 999999 || start + state.pages.length - 1 > 999999) throw Error('Escolha um número inicial entre 1 e 999999, considerando todas as páginas.');
  return { start, position: elements.numberPosition.value };
}

function drawPageNumber(page, font, number, position) {
  const value = String(number), size = 12, margin = 24;
  const { width, height } = page.getSize();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const displayWidth = angle % 180 ? height : width;
  const displayHeight = angle % 180 ? width : height;
  const textWidth = font.widthOfTextAtSize(value, size);
  const [vertical, horizontal] = position.split('-');
  const u = horizontal === 'left' ? margin : horizontal === 'center' ? (displayWidth - textWidth) / 2 : displayWidth - margin - textWidth;
  const v = vertical === 'top' ? displayHeight - margin - size : margin;
  const point = angle === 90 ? { x: width - v, y: u } : angle === 180 ? { x: width - u, y: height - v } : angle === 270 ? { x: v, y: height - u } : { x: u, y: v };
  page.drawText(value, { ...point, size, font, rotate: PDFLib.degrees(angle), color: PDFLib.rgb(0.16, 0.22, 0.29) });
}

async function compose(pages, numbering = null) {
  const result = await PDFLib.PDFDocument.create();
  const font = numbering ? await result.embedFont(PDFLib.StandardFonts.Helvetica) : null;
  for (const [position, item] of pages.entries()) {
    const [copied] = await result.copyPages(item.source.document, [item.index]);
    copied.setRotation(PDFLib.degrees((copied.getRotation().angle + item.rotation) % 360));
    result.addPage(copied);
    await annotate(result, copied, item.annotation);
    if (numbering) drawPageNumber(copied, font, numbering.start + position, numbering.position);
  }
  return new Uint8Array(await result.save());
}

function parseRanges(value, count) {
  const groups = value.split(',').map(part => part.trim());
  if (!value.trim() || groups.length > 50) throw Error('Informe de 1 a 50 intervalos, separados por vírgulas.');
  return groups.map(part => {
    if (!/^\d+(?:-\d+)?$/.test(part)) throw Error(`Intervalo inválido: ${part || '(vazio)'}.`);
    const [start, end = start] = part.split('-').map(Number);
    if (start < 1 || end > count || end < start) throw Error(`Intervalo fora das páginas disponíveis: ${part}.`);
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset - 1);
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const encoder = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const [name, bytes] of files) {
    const label = encoder.encode(name), crc = crc32(bytes);
    const local = new Uint8Array(30 + label.length), view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
    view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true); view.setUint16(26, label.length, true);
    local.set(label, 30); parts.push(local, bytes);
    const record = new Uint8Array(46 + label.length), index = new DataView(record.buffer);
    index.setUint32(0, 0x02014b50, true); index.setUint16(4, 20, true); index.setUint16(6, 20, true); index.setUint16(8, 0x0800, true);
    index.setUint32(16, crc, true); index.setUint32(20, bytes.length, true); index.setUint32(24, bytes.length, true);
    index.setUint16(28, label.length, true); index.setUint32(42, offset, true); record.set(label, 46);
    central.push(record); offset += local.length + bytes.length;
  }
  const centralSize = central.reduce((sum, record) => sum + record.length, 0);
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true); view.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

async function exportSplit() {
  if (!state.pages.length || state.busy) return;
  let groups;
  try { groups = parseRanges(elements.splitRanges.value, state.pages.length); }
  catch (err) { status(err.message, true); return; }
  setBusy(true); status('Criando as partes do PDF…');
  try {
    const files = [];
    for (let i = 0; i < groups.length; i++) {
      files.push([`parte-${String(i + 1).padStart(2, '0')}.pdf`, await compose(groups[i].map(index => state.pages[index]))]);
    }
    download(zip(files), 'quebec-pdf-dividido.zip', 'application/zip');
    status(`${files.length} parte${files.length === 1 ? '' : 's'} pronta${files.length === 1 ? '' : 's'} para baixar.`);
  } catch (err) { status(`Não foi possível dividir o PDF: ${err.message}`, true); }
  finally { setBusy(false); }
}

async function runExport(pages, suffix) {
  if (!pages.length || state.busy) return;
  let numbering = null;
  try { if (state.mode === 'number') numbering = numberSettings(); }
  catch (err) { status(err.message, true); return; }
  setBusy(true); status('Preparando o PDF…');
  try {
    const bytes = await compose(pages, numbering);
    download(bytes, `quebec-pdf-${suffix}.pdf`, 'application/pdf');
    status(`PDF com ${pages.length} página${pages.length === 1 ? '' : 's'} pronto para baixar.`);
  } catch (err) { status(`Não foi possível criar o PDF: ${err.message}`, true); }
  finally { setBusy(false); }
}

async function exportImages() {
  if (!state.pages.length || state.busy) return;
  const scope = elements.imageScope.value;
  const pages = scope === 'active' ? [state.active] : scope === 'selected' ? state.pages.filter(page => page.selected) : state.pages;
  if (!pages.length) { status('Selecione ao menos uma página.', true); return; }
  if (pages.length > MAX_IMAGES) { status(`Selecione até ${MAX_IMAGES} páginas por conversão.`, true); return; }
  const jpeg = elements.imageFormat.value === 'jpeg', extension = jpeg ? 'jpg' : 'png', mime = jpeg ? 'image/jpeg' : 'image/png';
  setBusy(true); status(`Convertendo ${pages.length} página${pages.length === 1 ? '' : 's'}…`);
  try {
    const files = [];
    for (const item of pages) {
      const page = await item.source.reader.getPage(item.index + 1);
      const base = page.getViewport({ scale: 1, rotation: (page.rotate + item.rotation) % 360 });
      const viewport = page.getViewport({ scale: Math.min(2, 2400 / Math.max(base.width, base.height)), rotation: (page.rotate + item.rotation) % 360 });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, jpeg ? 0.9 : undefined));
      canvas.width = canvas.height = 0;
      if (!blob) throw Error('Falha ao gerar imagem');
      const index = state.pages.indexOf(item) + 1;
      files.push([`quebec-pagina-${String(index).padStart(3, '0')}.${extension}`, new Uint8Array(await blob.arrayBuffer())]);
    }
    if (files.length === 1) download(files[0][1], files[0][0], mime);
    else download(zip(files), 'quebec-paginas-imagens.zip', 'application/zip');
    status(`${files.length} ${files.length === 1 ? 'imagem pronta' : 'imagens prontas'} para baixar.`);
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
elements.clear.addEventListener('click', async () => { await clearDocuments(); status('Área de trabalho limpa.'); });
elements.exportAll.addEventListener('click', () => runExport(state.pages, 'completo'));
elements.exportSelected.addEventListener('click', () => runExport(state.pages.filter(page => page.selected), 'selecionadas'));
elements.exportSplit.addEventListener('click', exportSplit);
elements.exportImages.addEventListener('click', exportImages);
elements.imageScope.addEventListener('change', updateControls);
elements.selectAll.addEventListener('click', () => { state.pages.forEach(page => page.selected = true); renderPages(); });
elements.selectNone.addEventListener('click', () => { state.pages.forEach(page => page.selected = false); renderPages(); });
for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => openTool(button.dataset.tool));
for (const filter of document.querySelectorAll('[data-filter]')) filter.addEventListener('click', () => {
  for (const button of document.querySelectorAll('[data-filter]')) {
    button.classList.toggle('active', button === filter);
    button.setAttribute('aria-pressed', String(button === filter));
  }
  for (const card of document.querySelectorAll('[data-tool]')) card.hidden = filter.dataset.filter !== 'all' && card.dataset.category !== filter.dataset.filter;
});
elements.backToTools.addEventListener('click', () => { elements.workspace.hidden = true; elements.tools.hidden = true; elements.catalog.scrollIntoView({ behavior: 'smooth' }); });
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
