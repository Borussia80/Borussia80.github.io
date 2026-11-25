// Teste de ponta a ponta de /dias-uteis/ com Playwright (Chromium).
// Uso: node tests/dias-uteis.e2e.cjs        (SCREENSHOT_DIR=pasta grava capturas em 5 larguras × 2 temas)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { serve } = require('./_e2e-base.cjs');

const SHOTS = process.env.SCREENSHOT_DIR;
const LARGURAS = [1280, 1100, 860, 600, 375];

/** Leitor de CSV conforme a RFC 4180 (aspas, aspas duplicadas, separador dentro de aspas, CRLF). */
function lerCSV(texto, sep) {
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\r' && texto[i + 1] === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; i++; }
    else campo += c;
  }
  assert.equal(aspas, false, 'CSV sem aspas abertas');
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const erros = [];
  const nova = async (ctxOpts = {}, url = '/dias-uteis/') => {
    const ctx = await browser.newContext({ acceptDownloads: true, ...ctxOpts });
    const page = await ctx.newPage();
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
    await page.goto(base + url);
    await page.waitForSelector('html[data-du-pronto="1"]', { timeout: 15000 });
    return { ctx, page };
  };
  const saida = (page, id) => page.locator(id).innerText();

  try {
    // 1. Mapa: 27 estados, clique em cada um sincroniza a lista e o painel
    let { ctx, page } = await nova();
    assert.equal(await page.locator('.mapa-br .uf').count(), 27, '27 estados no mapa');
    assert.equal(await page.locator('#uf option').count(), 28, '27 estados + "só nacionais"');
    for (const uf of await page.locator('.mapa-br .uf').evaluateAll(gs => gs.map(g => g.dataset.uf))) {
      await page.locator(`.mapa-br .uf[data-uf="${uf}"] path`).dispatchEvent('click');
      assert.equal(await page.inputValue('#uf'), uf, `clique em ${uf}`);
      assert.equal(await page.getAttribute(`.mapa-br .uf[data-uf="${uf}"]`, 'aria-pressed'), 'true');
      assert.equal(await page.locator('.mapa-br .uf[aria-pressed="true"]').count(), 1);
    }
    // Clique de novo no mesmo estado limpa a seleção
    await page.locator('.mapa-br .uf[data-uf="TO"] path').dispatchEvent('click');
    assert.equal(await page.inputValue('#uf'), 'TO');
    await page.locator('.mapa-br .uf[data-uf="TO"] path').dispatchEvent('click');
    assert.equal(await page.inputValue('#uf'), '', 'segundo clique limpa');

    // 2. Teclado: foco no estado + Enter
    await page.focus('.mapa-br .uf[data-uf="SE"]');
    await page.keyboard.press('Enter');
    assert.equal(await page.inputValue('#uf'), 'SE', 'Enter seleciona');
    await page.focus('.mapa-br .uf[data-uf="BA"]');
    await page.keyboard.press(' ');
    assert.equal(await page.inputValue('#uf'), 'BA', 'Espaço seleciona');

    // 3. Lista do ano e cálculos da Bahia em 2026
    await page.selectOption('#ano', '2026');
    assert.match(await page.locator('#lista').innerText(), /02\/07\/2026[\s\S]*Independência da Bahia/);
    assert.match(await page.locator('#lista').innerText(), /16\/02\/2026[\s\S]*Facultativo tratado como feriado/);
    assert.match(await saida(page, '#total'), /dias úteis em 2026/);
    await page.fill('#s-inicio', '2026-11-19'); await page.fill('#s-n', '1');
    assert.match(await saida(page, '#s-out'), /23\/11\/2026/);
    assert.match(await page.locator('#s-meio').innerText(), /20\/11\/2026.*Consciência Negra/);
    await page.fill('#s-inicio', '2026-02-13');
    assert.match(await saida(page, '#s-out'), /18\/02\/2026/, 'Cinzas útil por padrão');
    await page.click('#opcoes summary');
    await page.check('#o-cinzas');
    assert.match(await saida(page, '#s-out'), /19\/02\/2026/, 'Cinzas não útil com a opção');
    await page.fill('#c-inicio', '2026-07-01'); await page.fill('#c-fim', '2026-07-03');
    assert.match(await saida(page, '#c-out'), /^1 dia útil\n/, 'sem o dia inicial: 03/07');
    await page.check('#o-inicio');
    assert.match(await saida(page, '#c-out'), /^2 dias úteis/, 'com o dia inicial: 01 e 03/07');
    await page.fill('#o-extras', '03/07/2026 Recesso\n99/99/2026 errada'); await page.locator('#o-extras').blur();
    assert.match(await saida(page, '#c-out'), /^1 dia útil/, 'folga extra');
    assert.match(await saida(page, '#status'), /99\/99\/2026/, 'avisa folga inválida');
    await page.fill('#o-extras', ''); await page.locator('#o-extras').blur();
    await page.uncheck('#o-inicio');

    // 4. Exportações
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csvTxt = fs.readFileSync(await csv.path(), 'utf8');
    assert.equal(csvTxt.charCodeAt(0), 0xFEFF, 'CSV com BOM');
    assert.match(csvTxt, /^﻿data;dia_da_semana;feriado;tipo;dia_util\r\n/);
    assert.match(csvTxt, /02\/07\/2026;quinta-feira;"Independência da Bahia";"Estadual";não/);
    assert.equal(csv.suggestedFilename(), 'feriados-BA-2026.csv');
    const linhas = await page.locator('#lista tr').count();
    const [ics] = await Promise.all([page.waitForEvent('download'), page.click('#ics')]);
    const icsTxt = fs.readFileSync(await ics.path(), 'utf8');
    assert.match(icsTxt, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    assert.match(icsTxt, /END:VCALENDAR\r\n$/);
    assert.equal((icsTxt.match(/BEGIN:VEVENT/g) || []).length, linhas, 'um evento por feriado');
    assert.match(icsTxt, /DTSTART;VALUE=DATE:20260702\r\nDTEND;VALUE=DATE:20260703/);
    // Validação por parsers reais: ical.js (o mesmo motor de leitura do Thunderbird) e CSV RFC 4180
    const ICAL = (await import('ical.js')).default;
    const cal = new ICAL.Component(ICAL.parse(icsTxt));
    assert.equal(cal.getFirstPropertyValue('version'), '2.0');
    const eventos = cal.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
    assert.equal(eventos.length, linhas);
    for (const ev of eventos) {
      assert.ok(ev.summary && ev.uid, 'evento com título e UID');
      assert.equal(ev.startDate.isDate, true, 'evento de dia inteiro');
      assert.equal(ev.endDate.toJSDate() - ev.startDate.toJSDate(), 86400000, 'dura um dia');
    }
    assert.equal(new Set(eventos.map(e => e.uid)).size, eventos.length, 'UIDs únicos');
    assert.equal(eventos.find(e => e.startDate.toString() === '2026-07-02').summary, 'Independência da Bahia');
    const registros = lerCSV(csvTxt.slice(1), ';');
    assert.deepEqual(registros[0], ['data', 'dia_da_semana', 'feriado', 'tipo', 'dia_util']);
    assert.equal(registros.length - 1, linhas, 'uma linha por feriado');
    for (const r of registros.slice(1)) { assert.equal(r.length, 5, `5 colunas: ${r}`); assert.match(r[0], /^\d{2}\/\d{2}\/2026$/); assert.match(r[4], /^(sim|não)$/); }

    // 5. Persistência e URL
    await page.reload(); await page.waitForSelector('html[data-du-pronto="1"]');
    assert.equal(await page.inputValue('#uf'), 'BA', 'estado lembrado');
    assert.equal(await page.isChecked('#o-cinzas'), true, 'opção lembrada');
    assert.match(page.url(), /uf=BA&ano=2026/);
    await ctx.close();
    ({ ctx, page } = await nova({}, '/dias-uteis/?uf=PE&ano=2027'));
    assert.equal(await page.inputValue('#uf'), 'PE');
    assert.equal(await page.inputValue('#ano'), '2027');
    assert.match(await page.locator('#lista').innerText(), /06\/03\/2027[\s\S]*Data Magna de Pernambuco/);
    assert.doesNotMatch(await page.locator('#lista').innerText(), /São João/);
    await ctx.close();

    // 6. localStorage bloqueado (modo privado restrito): funciona sem salvar
    ({ ctx, page } = await (async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } }); });
      const page = await ctx.newPage();
      page.on('pageerror', e => erros.push(`pageerror (sem storage): ${e.message}`));
      await page.goto(base + '/dias-uteis/?uf=SP&ano=2026');
      await page.waitForSelector('html[data-du-pronto="1"]');
      return { ctx, page };
    })());
    assert.match(await page.locator('#lista').innerText(), /09\/07\/2026[\s\S]*Revolução Constitucionalista/);
    await ctx.close();

    // 7. Responsivo: sem rolagem horizontal; DF e SE alcançáveis no celular; capturas
    for (const tema of ['light', 'dark']) {
      for (const w of LARGURAS) {
        const c = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: tema, deviceScaleFactor: 1 });
        const p = await c.newPage();
        p.on('pageerror', e => erros.push(`pageerror (${w}): ${e.message}`));
        await p.goto(base + '/dias-uteis/?uf=BA&ano=2026');
        await p.waitForSelector('html[data-du-pronto="1"]');
        const sobra = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(sobra <= 0, `rolagem horizontal de ${sobra}px em ${w}px (${tema})`);
        if (w === 375) {
          for (const uf of ['DF', 'SE']) {
            const box = await p.locator(`.mapa-br .uf[data-uf="${uf}"]`).boundingBox();
            assert.ok(box && box.width >= 6 && box.height >= 6, `${uf} visível no celular (${box && box.width.toFixed(1)}×${box && box.height.toFixed(1)})`);
          }
        }
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `dias-uteis-${w}-${tema}.png`), fullPage: true }); }
        await c.close();
      }
    }

    assert.deepEqual(erros, [], 'sem erros no console');
    console.log('Dias úteis (e2e): mapa 27 UFs, teclado, cálculos, opções, exportações, persistência, URL, sem storage, 5 larguras × 2 temas: OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
