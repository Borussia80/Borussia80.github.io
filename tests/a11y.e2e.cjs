// Auditoria automática de acessibilidade (axe-core, WCAG 2.1 A/AA) das ferramentas novas.
// Uso: npm install --no-save --no-package-lock axe-core@4.14.1 && node tests/a11y.e2e.cjs
//      Sem internet: CDN_MIRROR=<node_modules com sortablejs@1.15.7>.
// O axe-core (MPL-2.0) só roda aqui, no teste; não é publicado no site.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { serve, mirrorCdn } = require('./_e2e-base.cjs');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const EXEMPLO_EIS = JSON.stringify({ versao: 1, tarefas: [
  { titulo: 'Fechar proposta', quadrante: 1, prazo: '2020-01-10' }, { titulo: 'Planejar treinamento', quadrante: 2 },
  { titulo: 'Responder e-mails', quadrante: 3, concluida: true }, { titulo: 'Organizar downloads', quadrante: 4 }] });

const PAGINAS = [
  { nome: 'dias-uteis', url: '/dias-uteis/?uf=BA&ano=2026', pronto: 'html[data-du-pronto="1"]',
    estados: [async p => {}, async p => { await p.click('#opcoes summary'); }] },
  { nome: 'eisenhower', url: '/eisenhower/', pronto: 'html[data-eis-pronto="1"]', init: EXEMPLO_EIS,
    estados: [async p => {}, async p => { await p.locator('#q2-l .eis-item').focus(); await p.keyboard.press('Enter'); },
      async p => { await p.click('#limpar'); }] }
];

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const falhas = [];
  let verificacoes = 0;
  try {
    for (const pg of PAGINAS) for (const tema of ['light', 'dark']) for (const w of [1280, 375]) for (const [i, estado] of pg.estados.entries()) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: tema });
      await mirrorCdn(ctx);
      if (pg.init) await ctx.addInitScript(s => { localStorage.setItem('qb.eisenhower.v1', s); }, pg.init);
      const page = await ctx.newPage();
      await page.goto(base + pg.url);
      await page.waitForSelector(pg.pronto);
      await estado(page);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
      verificacoes++;
      for (const v of r.violations) for (const n of v.nodes) falhas.push(`${pg.nome} ${tema} ${w}px estado ${i}: [${v.id}] ${v.help} → ${n.target.join(' ')} ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
      await ctx.close();
    }
    if (falhas.length) { console.error([...new Set(falhas)].join('\n')); }
    assert.equal(falhas.length, 0, `${falhas.length} violações de acessibilidade`);
    console.log(`Acessibilidade (axe-core, WCAG 2.1 AA): ${verificacoes} verificações em 2 ferramentas, 2 temas, 2 larguras: sem violações`);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
