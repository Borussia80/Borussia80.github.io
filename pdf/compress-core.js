// Núcleo do compressor de PDF: funções puras, sem DOM. Usado pelo Web Worker (modo estrutural),
// pela interface (presets, formatação) e pelos testes em Node. Depende apenas de pdf-lib (MIT),
// recebido por parâmetro, e da API nativa CompressionStream.

export const PRESETS = Object.freeze({
  leve: Object.freeze({ label: 'Leve', dpi: 150, quality: 0.85 }),
  equilibrado: Object.freeze({ label: 'Equilibrado', dpi: 120, quality: 0.70 }),
  maximo: Object.freeze({ label: 'Máximo', dpi: 96, quality: 0.55 })
});

// Limite de pixels por página renderizada (≈ 16,7 MP, teto seguro de canvas em navegadores móveis).
export const MAX_CANVAS_PIXELS = 16_777_216;
export const MAX_BYTES = 30 * 1024 * 1024;

const number = (value, digits) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${number(value, value < 100 ? 1 : 0)} ${units[unit]}`;
}

/** Percentual de redução (positivo = menor). Arredondado a 1 casa. */
export function reductionPercent(original, compressed) {
  if (!(original > 0) || !(compressed >= 0)) return 0;
  return Math.round((1 - compressed / original) * 1000) / 10;
}

export function formatPercent(value) { return `${number(value, 1)}%`; }

/** Escala de renderização para um DPI alvo, limitada a maxPixels. Dimensões em pontos (1/72 pol). */
export function renderScale(widthPt, heightPt, dpi, maxPixels = MAX_CANVAS_PIXELS) {
  const wanted = dpi / 72;
  const area = widthPt * heightPt * wanted * wanted;
  return area > maxPixels ? Math.sqrt(maxPixels / (widthPt * heightPt)) : wanted;
}

/** Compressão zlib (RFC 1950), exatamente o formato que /FlateDecode espera. Não usar 'deflate-raw'. */
export async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function friendlyError(err) {
  const text = String(err?.name || '') + ' ' + String(err?.message || err || '');
  if (/encrypt|password/i.test(text)) return 'Este PDF é protegido por senha e não pode ser comprimido.';
  if (/invalid|parse|header|xref|trailer/i.test(text)) return 'Não foi possível ler este arquivo como PDF.';
  return `Não foi possível comprimir o PDF: ${err?.message || 'erro desconhecido'}.`;
}

/**
 * Modo estrutural: preserva texto, vetores, formulários, favoritos e metadados.
 * 1) remove miniaturas de página (/Thumb) e dados privados de aplicativos (/PieceInfo);
 * 2) descarta objetos não alcançáveis a partir do trailer (Root/Info);
 * 3) comprime com /FlateDecode os streams que estão sem filtro;
 * 4) grava com object streams (tabela xref compacta).
 */
export async function optimizeStructure(PDFLib, input, { onProgress = () => {}, compress = deflate } = {}) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream } = PDFLib;
  onProgress({ stage: 'read' });
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const context = doc.context;
  const stats = { removedObjects: 0, recompressedStreams: 0, removedThumbnails: 0 };

  onProgress({ stage: 'clean' });
  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('Thumb'))) { page.node.delete(PDFName.of('Thumb')); stats.removedThumbnails++; }
    page.node.delete(PDFName.of('PieceInfo'));
  }
  doc.catalog.delete(PDFName.of('PieceInfo'));

  // Coleta por alcançabilidade a partir do trailer.
  const reachable = new Set();
  const pending = [];
  const visit = value => {
    if (value instanceof PDFRef) {
      if (reachable.has(value)) return;
      reachable.add(value);
      const target = context.lookup(value);
      if (target) pending.push(target);
    } else if (value) pending.push(value);
  };
  const { Root, Info, Encrypt } = context.trailerInfo;
  [Root, Info, Encrypt].forEach(visit);
  while (pending.length) {
    const item = pending.pop();
    if (item instanceof PDFStream) visit(item.dict);
    else if (item instanceof PDFDict) for (const [, value] of item.entries()) visit(value);
    else if (item instanceof PDFArray) for (const value of item.asArray()) visit(value);
    else if (item instanceof PDFRef) visit(item);
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reachable.has(ref)) { context.delete(ref); stats.removedObjects++; }
  }

  // Streams sem filtro → /FlateDecode.
  const candidates = [];
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    const filter = dict.get(PDFName.of('Filter'));
    const hasFilter = filter && !(filter instanceof PDFArray && filter.size() === 0);
    if (hasFilter || dict.has(PDFName.of('DecodeParms'))) continue;
    if (dict.get(PDFName.of('Type')) === PDFName.of('Metadata')) continue; // XMP fica legível
    if (object.contents.length < 64) continue;
    candidates.push([ref, object]);
  }
  for (let i = 0; i < candidates.length; i++) {
    const [ref, object] = candidates[i];
    onProgress({ stage: 'compress', current: i + 1, total: candidates.length });
    const packed = await compress(object.contents);
    if (packed.length >= object.contents.length) continue;
    const dict = object.dict.clone(context);
    dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    context.assign(ref, PDFRawStream.of(dict, packed));
    stats.recompressedStreams++;
  }

  onProgress({ stage: 'write' });
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  return { bytes, stats, pages: doc.getPageCount() };
}
