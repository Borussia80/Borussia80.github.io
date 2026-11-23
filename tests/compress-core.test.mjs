// Testes do núcleo do compressor (pdf/compress-core.js).
// Uso: node tests/compress-core.test.mjs
// A parte de integração usa o pacote pdf-lib@1.17.1 (MIT) se estiver instalado; caso contrário é pulada.
//   Ex.: npm i --no-save pdf-lib@1.17.1   (ou PDF_LIB_PATH=/caminho/para/pdf-lib)
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { PRESETS, formatBytes, reductionPercent, formatPercent, renderScale, deflate, friendlyError, optimizeStructure } from '../pdf/compress-core.js';

// Presets exigidos
assert.deepEqual({ ...PRESETS.leve }, { label: 'Leve', dpi: 150, quality: 0.85 });
assert.deepEqual({ ...PRESETS.equilibrado }, { label: 'Equilibrado', dpi: 120, quality: 0.70 });
assert.deepEqual({ ...PRESETS.maximo }, { label: 'Máximo', dpi: 96, quality: 0.55 });
assert.ok(Object.isFrozen(PRESETS) && Object.isFrozen(PRESETS.leve));

// Formatação pt-BR
assert.equal(formatBytes(0), '0 B');
assert.equal(formatBytes(1023), '1023 B');
assert.equal(formatBytes(1536), '1,5 KB');
assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
assert.equal(formatBytes(150 * 1024 * 1024), '150 MB');
assert.equal(formatBytes(-1), '—');
assert.equal(reductionPercent(1000, 250), 75);
assert.equal(reductionPercent(1000, 1200), -20);
assert.equal(reductionPercent(0, 10), 0);
assert.equal(formatPercent(42.5), '42,5%');

// Escala: DPI/72, limitada pelo total de pixels
assert.equal(renderScale(595, 842, 144), 2);
const capped = renderScale(5000, 5000, 150, 1_000_000);
assert.ok(Math.abs(5000 * capped * 5000 * capped - 1_000_000) < 1);

// CompressionStream('deflate') gera zlib (cabeçalho 0x78), exatamente o que /FlateDecode espera
const sample = new TextEncoder().encode('BT /F1 12 Tf 72 720 Td (Ola mundo) Tj ET\n'.repeat(200));
const packed = await deflate(sample);
assert.equal(packed[0], 0x78, 'esperado cabeçalho zlib, não deflate-raw');
assert.deepEqual(new Uint8Array(inflateSync(packed)), sample);
assert.ok(packed.length < sample.length);

assert.match(friendlyError(new Error('Input document to `PDFDocument.load` is encrypted')), /senha/);
assert.match(friendlyError(new Error('Failed to parse PDF document (line:0 col:0 offset=0): No PDF header found')), /Não foi possível ler/);
console.log('compress-core: presets, formatação, escala e zlib: OK');

// Integração com pdf-lib (opcional)
let PDFLib = null;
try { PDFLib = await import(process.env.PDF_LIB_PATH || 'pdf-lib'); } catch { /* não instalado */ }
if (!PDFLib) {
  console.log('compress-core: pdf-lib não encontrado; teste estrutural pulado (npm i --no-save pdf-lib@1.17.1).');
} else {
  const lib = PDFLib.default?.PDFDocument ? PDFLib.default : PDFLib;
  const { PDFDocument, PDFName, PDFRawStream, StandardFonts } = lib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) doc.addPage([595, 842]).drawText(`Pagina ${i + 1} texto preservado`, { x: 72, y: 720, size: 14, font });
  // stream de conteúdo sem filtro (grande) na página 1
  const raw = new TextEncoder().encode('q 0 0 1 rg 10 10 m 100 100 l S Q\n'.repeat(4000));
  const contentRef = doc.context.register(PDFRawStream.of(doc.context.obj({}), raw));
  const page1 = doc.getPage(0).node;
  page1.addContentStream(contentRef);
  // miniatura e objeto órfão
  page1.set(PDFName.of('Thumb'), doc.context.register(PDFRawStream.of(doc.context.obj({}), new Uint8Array(20000).fill(7))));
  doc.context.register(PDFRawStream.of(doc.context.obj({}), new Uint8Array(50000).fill(9)));
  doc.setTitle('Documento de teste');
  const input = await doc.save({ useObjectStreams: false });

  const stages = [];
  const { bytes, stats, pages } = await optimizeStructure(lib, input, { onProgress: p => stages.push(p.stage) });
  assert.equal(pages, 3);
  assert.ok(bytes.length < input.length, `esperado menor: ${bytes.length} < ${input.length}`);
  assert.equal(stats.removedThumbnails, 1);
  assert.ok(stats.removedObjects >= 2, 'miniatura e órfão removidos');
  assert.ok(stats.recompressedStreams >= 1);
  assert.deepEqual([...new Set(stages)], ['read', 'clean', 'compress', 'write']);

  const out = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(out.getPageCount(), 3);
  assert.equal(out.getTitle(), 'Documento de teste');
  assert.equal(out.getPage(0).node.get(PDFName.of('Thumb')), undefined);
  // o stream recomprimido declara /FlateDecode e é zlib válido
  let found = false;
  for (const [, obj] of out.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Filter')) === PDFName.of('FlateDecode')) {
      const text = new TextDecoder().decode(inflateSync(obj.contents));
      if (text.startsWith('q 0 0 1 rg')) { found = true; assert.equal(text.length, raw.length); }
    }
  }
  assert.ok(found, 'conteúdo recomprimido com /FlateDecode');
  // PDF já otimizado: rodar de novo não pode corromper e não deve crescer muito
  const again = await optimizeStructure(lib, bytes);
  assert.equal((await PDFDocument.load(again.bytes)).getPageCount(), 3);
  // PDF inválido gera erro amigável
  await assert.rejects(optimizeStructure(lib, new TextEncoder().encode('não é pdf')), err => /ler/.test(friendlyError(err)));
  console.log(`compress-core: modo estrutural ${formatBytes(input.length)} → ${formatBytes(bytes.length)} (${formatPercent(reductionPercent(input.length, bytes.length))}): OK`);
}
