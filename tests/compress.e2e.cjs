// Teste de ponta a ponta do "Comprimir PDF" com Playwright (Chromium).
// Uso: node tests/compress.e2e.cjs
// Sobe um servidor estático na raiz do repositório. As bibliotecas vêm do jsDelivr (versões fixas);
// sem acesso à internet, defina CDN_MIRROR=<pasta node_modules com pdf-lib@1.17.1 e pdfjs-dist@4.10.38>
// para servir as mesmas versões localmente (as URLs do CDN são interceptadas).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const { ROOT, serve } = require('./_e2e-base.cjs');
const MIRROR = process.env.CDN_MIRROR;
const SHOTS = process.env.SCREENSHOT_DIR;

async function mirrorCdn(context) {
  if (!MIRROR) return;
  await context.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(pdf-lib@1\.17\.1|pdfjs-dist@4\.10\.38)\/(.+)$/, (route) => {
    const [, spec, rest] = route.request().url().match(/npm\/((?:pdf-lib|pdfjs-dist))@[^/]+\/(.+)$/);
    const file = path.join(MIRROR, spec, rest);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

// Gera PDFs de teste no próprio navegador com window.PDFLib.
async function makeFixtures(page) {
  const out = await page.evaluate(async () => {
    const { PDFDocument, StandardFonts, PDFRawStream, PDFName } = window.PDFLib;
    // 1) PDF de texto com conteúdo sem compressão e objeto órfão
    const text = await PDFDocument.create();
    const font = await text.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 4; i++) {
      const p = text.addPage([595, 842]);
      p.drawText(`Relatório página ${i + 1}`, { x: 72, y: 760, size: 20, font });
      const ops = new TextEncoder().encode(Array.from({ length: 3000 }, (_, k) => `${k % 500} ${k % 700} m ${(k * 7) % 500} ${(k * 3) % 700} l S`).join('\n'));
      const ref = text.context.register(PDFRawStream.of(text.context.obj({}), ops));
      p.node.addContentStream(ref);
    }
    text.context.register(PDFRawStream.of(text.context.obj({}), new Uint8Array(80000).fill(1)));
    // 2) "escaneado": páginas com imagem PNG grande e ruidosa
    const scan = await PDFDocument.create();
    const c = document.createElement('canvas'); c.width = 900; c.height = 1270;
    const g = c.getContext('2d');
    for (let i = 0; i < 3; i++) {
      const img = g.createImageData(c.width, c.height);
      for (let k = 0; k < img.data.length; k += 4) { const v = 150 + Math.random() * 100; img.data[k] = v; img.data[k + 1] = v - 10 * Math.random(); img.data[k + 2] = v - 30 * Math.random(); img.data[k + 3] = 255; } // ruído: comporta-se como foto
      g.putImageData(img, 0, 0); g.fillStyle = '#123'; g.font = '48px sans-serif'; g.fillText(`Documento escaneado ${i + 1}`, 100, 200);
      const png = await scan.embedPng(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
      scan.addPage([595, 842]).drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
    }
    // 3) PDF mínimo e já compacto
    const small = await PDFDocument.create();
    small.addPage([200, 200]);
    // 4) PDF longo para testar o cancelamento
    const long = await PDFDocument.create();
    const lf = await long.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 60; i++) long.addPage([595, 842]).drawText(`Página longa ${i + 1}`, { x: 72, y: 760, size: 24, font: lf });
    const save = async (d, opts) => Array.from(await d.save(opts));
    return { text: await save(text, { useObjectStreams: false }), scan: await save(scan), small: await save(small, { useObjectStreams: true }), long: await save(long) };
  });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Buffer.from(v)]));
}

async function choose(page, name, buffer) {
  await page.waitForSelector('#cmpFile:not([disabled])', { state: 'attached' });
  if (await page.locator('#cmpFiles').isVisible()) await page.click('#cmpRemove');
  await page.setInputFiles('#cmpFile', { name, mimeType: 'application/pdf', buffer });
  await page.waitForSelector('#cmpFiles:not([hidden])');
}

async function runAndWait(page) {
  await page.click('#cmpRun');
  await page.waitForFunction(() => !document.getElementById('cmpResult').hidden || document.getElementById('cmpStatus').classList.contains('is-error'), null, { timeout: 120000 });
  if (await page.locator('#cmpStatus.is-error').count()) throw new Error('Erro na interface: ' + await page.textContent('#cmpStatus'));
  return {
    original: await page.textContent('#cmpOriginal'), compressed: await page.textContent('#cmpCompressed'),
    reduction: await page.textContent('#cmpReduction'), optimized: await page.locator('#cmpOptimized').isVisible(),
    details: await page.textContent('#cmpDetails'), download: await page.getAttribute('#cmpDownload', 'download')
  };
}

async function downloadBytes(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cmpDownload')]);
  return fs.readFileSync(await dl.path());
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const failures = [];
  try {
    const context = await browser.newContext({ acceptDownloads: true, deviceScaleFactor: SHOTS ? 2 : 1, viewport: { width: 1280, height: 900 } });
    await mirrorCdn(context);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await page.goto(`${base}/pdf/`);
    await page.waitForFunction(() => /Pronto para receber/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
    assert.equal(await page.locator('[data-tool]').count(), 11);
    await page.click('[data-tool="compress"]');
    await page.waitForSelector('#compressor:not([hidden])');
    assert.equal(await page.locator('#workspace').isVisible(), false);
    const fx = await makeFixtures(page);

    // Modo estrutural
    await choose(page, 'relatorio.pdf', fx.text);
    const labels = new Set();
    const watcher = setInterval(async () => { try { labels.add(await page.textContent('#cmpProgressLabel')); } catch {} }, 5);
    let r = await runAndWait(page);
    clearInterval(watcher);
    console.log('Estrutural:', r);
    assert.equal(r.optimized, false);
    assert.match(r.reduction, /^\d+(,\d)?%$/);
    assert.match(r.download, /relatorio-comprimido\.pdf/);
    const structural = await downloadBytes(page);
    assert.ok(structural.length < fx.text.length);
    assert.equal(structural.subarray(0, 5).toString(), '%PDF-');
    // o texto continua extraível com PDF.js
    const extracted = await page.evaluate(async bytes => {
      const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
      const t = await (await doc.getPage(2)).getTextContent();
      const n = doc.numPages; await doc.destroy();
      return { n, text: t.items.map(i => i.str).join(' ') };
    }, Array.from(structural));
    assert.equal(extracted.n, 4);
    assert.match(extracted.text, /Relatório página 2/);

    // Modo imagens, preset Máximo, com rótulo "Página X de Y"
    await choose(page, 'escaneado.pdf', fx.scan);
    await page.click('[data-cmp-mode="images"]');
    assert.equal(await page.locator('#cmpPresetField').isVisible(), true);
    await page.click('[data-cmp-preset="maximo"]');
    const pageLabels = new Set();
    const w2 = setInterval(async () => { try { pageLabels.add(await page.textContent('#cmpProgressLabel')); } catch {} }, 5);
    r = await runAndWait(page);
    clearInterval(w2);
    console.log('Imagens (Máximo):', r, [...pageLabels].filter(Boolean));
    assert.ok([...pageLabels].some(l => /^Página \d+ de 3$/.test(l)), 'rótulo "Página X de 3" exibido');
    assert.match(r.details, /3 páginas convertidas a 96 DPI · qualidade JPEG 55%/);
    const scanned = await downloadBytes(page);
    assert.ok(scanned.length < fx.scan.length / 2, `redução forte esperada: ${scanned.length} vs ${fx.scan.length}`);
    const btn = await page.$eval('#cmpDownload', b => ({ text: b.textContent.trim(), color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor, fontFamily: getComputedStyle(b.lastChild.parentElement).fontFamily }));
    assert.equal(btn.text, 'Baixar PDF comprimido');
    assert.notEqual(btn.color, btn.bg, 'rótulo do download visível');
    if (SHOTS) await page.locator('#compressor').screenshot({ path: path.join(SHOTS, 'comprimir-resultado.png') });
    if (SHOTS) {
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.locator('#compressor').screenshot({ path: path.join(SHOTS, 'comprimir-resultado-escuro.png') });
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    }

    // PDF já otimizado
    await page.click('[data-cmp-mode="structural"]');
    await choose(page, 'pequeno.pdf', fx.small);
    r = await runAndWait(page);
    console.log('Já otimizado:', r);
    assert.equal(r.optimized, true);
    assert.equal(r.reduction, '0%');
    assert.equal(r.download, 'pequeno.pdf');
    assert.deepEqual(await downloadBytes(page), fx.small, 'download entrega o original');

    // Cancelar no modo imagens
    await choose(page, 'longo.pdf', fx.long);
    await page.click('[data-cmp-mode="images"]');
    await page.click('[data-cmp-preset="leve"]');
    await page.click('#cmpRun');
    await page.waitForFunction(() => /^Página ([3-9]|\d\d) de 60$/.test(document.getElementById('cmpProgressLabel').textContent));
    assert.equal(await page.locator('#cmpCancel').isVisible(), true);
    await page.click('#cmpCancel');
    await page.waitForFunction(() => /cancelada/.test(document.getElementById('cmpStatus').textContent));
    assert.equal(await page.locator('#cmpResult').isVisible(), false);
    assert.equal(await page.locator('#cmpCancel').isVisible(), false);
    assert.equal(await page.isEnabled('#cmpRun'), true);
    console.log('Cancelar (imagens): OK');

    // Cancelar no modo estrutural (worker.terminate)
    await page.click('[data-cmp-mode="structural"]');
    await page.click('#cmpRun');
    await page.click('#cmpCancel');
    await page.waitForFunction(() => /cancelada/.test(document.getElementById('cmpStatus').textContent));
    assert.equal(await page.locator('#cmpResult').isVisible(), false);
    console.log('Cancelar (estrutural): OK');

    // Arquivo que não é PDF
    await page.click('#cmpRemove');
    await page.setInputFiles('#cmpFile', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
    assert.match(await page.textContent('#cmpStatus.is-error'), /nota\.txt: tipo não aceito/);
    // PDF corrompido
    await page.setInputFiles('#cmpFile', { name: 'quebrado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('isto não é um pdf') });
    await page.click('#cmpRun');
    await page.waitForSelector('#cmpStatus.is-error');
    assert.match(await page.textContent('#cmpStatus'), /Não foi possível ler/);
    console.log('Erros de entrada: OK');

    const unexpected = consoleErrors.filter(e => !/Failed to load resource|Invalid PDF|No PDF header/i.test(e));
    if (unexpected.length) failures.push('Erros no console: ' + unexpected.join(' | '));

    // Falha ao carregar o Worker (pdf-lib ESM indisponível)
    const ctx2 = await browser.newContext();
    await mirrorCdn(ctx2);
    await ctx2.route('**/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js', route => route.abort());
    const p2 = await ctx2.newPage();
    await p2.goto(`${base}/pdf/`);
    await p2.waitForFunction(() => /Pronto para receber/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
    await p2.click('[data-tool="compress"]');
    await choose(p2, 'pequeno.pdf', fx.small);
    await p2.click('#cmpRun');
    await p2.waitForSelector('#cmpStatus.is-error', { timeout: 40000 });
    assert.match(await p2.textContent('#cmpStatus'), /processador de PDF em segundo plano/);
    assert.equal(await p2.isEnabled('#cmpRun'), true);
    console.log('Falha de carregamento do Worker tratada: OK');
    await ctx2.close();
  } catch (err) {
    failures.push(err.stack || String(err));
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) { console.error('FALHOU:\n' + failures.join('\n')); process.exit(1); }
  console.log('Comprimir PDF (Playwright): todos os cenários OK');
})();
