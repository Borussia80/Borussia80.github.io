// Teste de ponta a ponta de /eisenhower/ com Playwright (Chromium).
// Uso: node tests/eisenhower.e2e.cjs
//      Sem internet: CDN_MIRROR=<node_modules com sortablejs@1.15.7>. SCREENSHOT_DIR=pasta grava capturas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { serve, mirrorCdn } = require('./_e2e-base.cjs');

const SHOTS = process.env.SCREENSHOT_DIR;
const LARGURAS = [1280, 1100, 860, 600, 375];

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const erros = [];
  async function abrir(opts = {}, init) {
    const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
    await mirrorCdn(ctx);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
    await page.goto(base + '/eisenhower/');
    await page.waitForSelector('html[data-eis-pronto="1"]', { timeout: 15000 });
    return { ctx, page };
  }
  const titulos = (page, q) => page.locator(`#q${q}-l .eis-titulo`).allInnerTexts();
  const add = async (page, q, t) => { await page.fill(`#q${q}-i`, t); await page.press(`#q${q}-i`, 'Enter'); };

  try {
    let { ctx, page } = await abrir();
    assert.equal(await page.locator('.eis-q').count(), 4);
    assert.equal(await page.locator('.eis-vazio').count(), 4, 'quadrantes vazios no início');

    // 1. Adicionar
    await add(page, 1, 'Relatório mensal');
    await add(page, 1, 'Ligar para o cliente');
    await add(page, 2, 'Planejar 2027');
    await add(page, 4, 'Rede social');
    assert.deepEqual(await titulos(page, 1), ['Relatório mensal', 'Ligar para o cliente']);
    assert.equal(await page.inputValue('#q1-i'), '', 'campo limpo após adicionar');
    assert.match(await page.locator('#resumo').innerText(), /^4 abertas/);

    // 2. Arrastar com o mouse: "Rede social" (Q4) para o topo do Q3
    const origem = page.locator('#q4-l .eis-item').first();
    const destino = page.locator('#q3-l');
    const o = await origem.locator('.eis-arrastar').boundingBox();
    const d = await destino.boundingBox();
    await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(o.x + (d.x + d.width / 2 - o.x) * i / 12, o.y + (d.y + 20 - o.y) * i / 12);
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('#q3-l .eis-item').length === 1);
    assert.deepEqual(await titulos(page, 3), ['Rede social'], 'arrastou para Q3');
    assert.deepEqual(await titulos(page, 4), [], 'saiu do Q4');

    // 3. Reordenar arrastando dentro do Q1
    const seg = await page.locator('#q1-l .eis-item').nth(1).locator('.eis-arrastar').boundingBox();
    const pri = await page.locator('#q1-l .eis-item').nth(0).boundingBox();
    await page.mouse.move(seg.x + seg.width / 2, seg.y + seg.height / 2); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(seg.x + seg.width / 2, seg.y + (pri.y + 4 - seg.y) * i / 10);
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.deepEqual(await titulos(page, 1), ['Ligar para o cliente', 'Relatório mensal'], 'reordenou no Q1');

    // 4. Teclado: 1–4 move, Alt+↓ reordena, Espaço conclui, Enter edita, Delete apaga
    await page.locator('#q1-l .eis-item', { hasText: 'Ligar para o cliente' }).focus();
    await page.keyboard.press('2');
    assert.deepEqual(await titulos(page, 2), ['Planejar 2027', 'Ligar para o cliente'], 'tecla 2 move para o fim do Q2');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id) !== undefined, true, 'foco mantido na tarefa');
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await titulos(page, 2), ['Ligar para o cliente', 'Planejar 2027'], 'Alt+↑ sobe');
    await page.keyboard.press(' ');
    assert.equal(await page.locator('#q2-l .eis-item.is-done').count(), 1, 'Espaço conclui');
    await page.keyboard.press('Enter');
    await page.fill('.is-editing input:not([type=date])', 'Ligar para o cliente (urgente)');
    await page.fill('.is-editing input[type=date]', '2020-01-10');
    await page.click('.is-editing button[type=submit]');
    assert.match(await page.locator('#q2-l').innerText(), /Ligar para o cliente \(urgente\)/);
    assert.equal(await page.locator('#q2-l .eis-prazo').innerText(), 'até 10/01', 'concluída não aparece como atrasada');
    await page.locator('#q2-l .eis-item.is-done .eis-ok').click();
    assert.equal(await page.locator('#q2-l .eis-prazo.is-late').count(), 1, 'aberta com prazo vencido: atrasada');
    // Escape cancela edição
    await page.locator('#q2-l .eis-item').first().focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.is-editing').count(), 0);

    // 5. Menu "Mover para"
    await page.locator('#q2-l .eis-item', { hasText: 'Planejar 2027' }).locator('select').selectOption('1');
    assert.deepEqual(await titulos(page, 1), ['Relatório mensal', 'Planejar 2027']);

    // 6. Concluídas: ocultar, limpar com confirmação na página
    await page.locator('#q1-l .eis-item', { hasText: 'Relatório mensal' }).locator('.eis-ok').click();
    await page.uncheck('#ver-concluidas');
    assert.deepEqual(await titulos(page, 1), ['Planejar 2027'], 'oculta concluídas');
    await page.check('#ver-concluidas');
    page.on('dialog', d => { erros.push('diálogo do navegador aberto: ' + d.message()); d.dismiss(); });
    await page.click('#limpar');
    assert.equal(await page.isVisible('#confirmar'), true);
    await page.click('#confirmar-nao');
    assert.equal(await page.locator('.eis-item.is-done').count(), 1, 'cancelar não apaga');
    await page.click('#limpar'); await page.click('#confirmar-sim');
    assert.equal(await page.locator('.eis-item.is-done').count(), 0, 'confirmar apaga');

    // 7. Copiar como texto (Markdown)
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.click('#copiar-md');
    const md = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(md, /^## Fazer agora — urgente e importante\n- \[ \] Planejar 2027\n/);

    // 8. Persistência
    const antes = await page.locator('.eis-item').allInnerTexts();
    await page.reload(); await page.waitForSelector('html[data-eis-pronto="1"]');
    assert.deepEqual(await page.locator('.eis-item').allInnerTexts(), antes, 'tarefas mantidas após recarregar');

    // 9. Exportar e importar (com confirmação; arquivo inválido não altera nada)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportar')]);
    const backup = fs.readFileSync(await dl.path(), 'utf8');
    assert.equal(JSON.parse(backup).app, 'quebec-eisenhower');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eis-'));
    fs.writeFileSync(path.join(tmp, 'ruim.json'), '{"x":1}');
    await page.setInputFiles('#importar', path.join(tmp, 'ruim.json'));
    await page.waitForFunction(() => /não importado/.test(document.getElementById('status').textContent), null, { timeout: 5000 });
    assert.deepEqual(await page.locator('.eis-item').allInnerTexts(), antes, 'arquivo inválido não altera');
    const outro = { versao: 1, tarefas: [{ titulo: 'Do backup', quadrante: 3 }] };
    fs.writeFileSync(path.join(tmp, 'bom.json'), JSON.stringify(outro));
    await page.setInputFiles('#importar', path.join(tmp, 'bom.json'));
    await page.waitForSelector('#confirmar:not([hidden])');
    assert.match(await page.locator('#confirmar-titulo').innerText(), /Substituir 3 tarefas por 1/);
    await page.click('#confirmar-sim');
    assert.deepEqual(await titulos(page, 3), ['Do backup']);
    fs.writeFileSync(path.join(tmp, 'volta.json'), backup);
    await page.setInputFiles('#importar', path.join(tmp, 'volta.json'));
    await page.waitForSelector('#confirmar:not([hidden])'); await page.click('#confirmar-sim');
    assert.deepEqual(await page.locator('.eis-item').allInnerTexts(), antes, 'backup restaurado');

    // 10. Delete apaga e o foco vai para a vizinha
    await page.locator('#q1-l .eis-item').first().focus(); await page.keyboard.press('Delete');
    assert.equal(await page.locator('#q1-l .eis-item').count(), 0);
    await ctx.close();

    // 11. Sem localStorage: funciona e avisa
    ({ ctx, page } = await abrir({}, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } }); }));
    assert.match(await page.locator('#status').innerText(), /não permite salvar/);
    await add(page, 1, 'Sem armazenamento');
    assert.deepEqual(await titulos(page, 1), ['Sem armazenamento']);
    await ctx.close();

    // 12. Dados corrompidos: avisa e não quebra
    ({ ctx, page } = await abrir({}, () => { try { localStorage.setItem('qb.eisenhower.v1', '{quebrado'); } catch {} }));
    assert.match(await page.locator('#status').innerText(), /corrompidos/);
    await ctx.close();

    // 13. CDN fora do ar: menu e teclado continuam
    {
      const c = await browser.newContext();
      await c.route(/cdn\.jsdelivr\.net/, r => r.abort());
      const p = await c.newPage();
      p.on('pageerror', e => erros.push(`pageerror (sem CDN): ${e.message}`));
      await p.goto(base + '/eisenhower/'); await p.waitForSelector('html[data-eis-pronto="1"]');
      assert.match(await p.locator('#status').innerText(), /não carregou/);
      await p.fill('#q1-i', 'Sem CDN'); await p.press('#q1-i', 'Enter');
      await p.locator('#q1-l .eis-item').focus(); await p.keyboard.press('3');
      assert.equal(await p.locator('#q3-l .eis-item').count(), 1);
      await c.close();
    }

    // 14. Carga: 500 tarefas, render e movimento rápidos
    const grande = { versao: 1, tarefas: Array.from({ length: 500 }, (_, i) => ({ id: `g${i}`, titulo: `Tarefa ${i}`, quadrante: 1 + (i % 4), prazo: i % 7 ? null : '2027-01-15' })) };
    ({ ctx, page } = await (async () => {
      const c = await browser.newContext(); await mirrorCdn(c);
      await c.addInitScript(s => { localStorage.setItem('qb.eisenhower.v1', s); }, JSON.stringify(grande));
      const p = await c.newPage(); p.on('pageerror', e => erros.push(`pageerror (500): ${e.message}`));
      const t0 = Date.now(); await p.goto(base + '/eisenhower/'); await p.waitForSelector('html[data-eis-pronto="1"]');
      const ms = Date.now() - t0;
      assert.equal(await p.locator('.eis-item').count(), 500);
      assert.ok(ms < 5000, `500 tarefas carregadas em ${ms} ms`);
      const t1 = Date.now(); await p.locator('.eis-item[data-id="g0"]').focus(); await p.keyboard.press('4');
      await p.waitForSelector('#q4-l .eis-item[data-id="g0"]');
      assert.ok(Date.now() - t1 < 1000, `mover com 500 tarefas em ${Date.now() - t1} ms`);
      return { ctx: c, page: p };
    })());
    await ctx.close();

    // 15. Responsivo: sem rolagem horizontal; capturas
    const exemplo = { versao: 1, tarefas: [
      { titulo: 'Fechar proposta da Brava', quadrante: 1, prazo: '2026-11-27' }, { titulo: 'Revisar folha de dados FT-101', quadrante: 1 },
      { titulo: 'Planejar treinamento ISA', quadrante: 2, prazo: '2027-02-10' }, { titulo: 'Estudar inglês técnico', quadrante: 2 },
      { titulo: 'Responder e-mails do fornecedor', quadrante: 3 }, { titulo: 'Reunião de status (pode delegar)', quadrante: 3, concluida: true },
      { titulo: 'Reorganizar a pasta de downloads', quadrante: 4 }] };
    for (const tema of ['light', 'dark']) for (const w of LARGURAS) {
      const c = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: tema }); await mirrorCdn(c);
      await c.addInitScript(s => { localStorage.setItem('qb.eisenhower.v1', s); }, JSON.stringify(exemplo));
      const p = await c.newPage(); p.on('pageerror', e => erros.push(`pageerror (${w}): ${e.message}`));
      await p.goto(base + '/eisenhower/'); await p.waitForSelector('html[data-eis-pronto="1"]');
      const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(sobra <= 0, `rolagem horizontal de ${sobra}px em ${w}px (${tema})`);
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `eisenhower-${w}-${tema}.png`), fullPage: true }); }
      await c.close();
    }

    assert.deepEqual(erros, [], 'sem erros no console');
    console.log('Eisenhower (e2e): adicionar, arrastar entre quadrantes e reordenar, teclado, menu, concluídas, Markdown, persistência, backup, sem storage, dados corrompidos, sem CDN, 500 tarefas, 5 larguras × 2 temas: OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
