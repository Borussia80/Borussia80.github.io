#!/usr/bin/env node
// Lighthouse (modo celular) nas ferramentas, servidas localmente a partir do repositório.
// Uso: npm install --no-save --no-package-lock lighthouse@12.8.2 puppeteer-core@24 playwright@1.63.0
//      node tools/lighthouse.mjs [rota ...]          (padrão: /dias-uteis/ /eisenhower/)
//      CDN_MIRROR=<node_modules>  serve localmente os pacotes do jsDelivr (sem internet)
//      CHROME_PATH=<chrome>       usa outro Chrome (padrão: o Chromium do Playwright)
//      LH_SAIDA=<pasta>           grava o relatório HTML de cada página
// Metas do plano: desempenho ≥ 90 e acessibilidade ≥ 95. Sai com erro se alguma página ficar abaixo.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const lighthouse = (await import('lighthouse')).default;
const puppeteer = require('puppeteer-core');
const { serve } = require('../tests/_e2e-base.cjs');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const rotas = args.length ? args : ['/dias-uteis/', '/eisenhower/'];
const semMeta = new Set(process.argv.includes('--referencia') ? rotas : []);
const METAS = { performance: 90, accessibility: 95 };
const chrome = process.env.CHROME_PATH || require('playwright').chromium.executablePath();
const mirror = process.env.CDN_MIRROR;
const saida = process.env.LH_SAIDA;

const server = await serve(undefined, { gzip: true }); // compressão e cache de 10 min, como no GitHub Pages
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'], headless: true });
const linhas = [];
let falhou = false;
try {
  for (const rota of rotas) {
    const page = await browser.newPage();
    if (mirror) {
      await page.setRequestInterception(true);
      page.on('request', req => {
        const m = req.url().match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/([^?#]+)/);
        if (!m) return req.continue();
        const file = join(mirror, m[1], m[3]);
        if (!existsSync(file)) return req.respond({ status: 404, body: 'missing' });
        req.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: readFileSync(file) });
      });
    }
    const r = await lighthouse(base + rota, { output: saida ? 'html' : 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, undefined, page);
    const c = r.lhr.categories, a = r.lhr.audits;
    const nota = k => Math.round((c[k]?.score ?? 0) * 100);
    const linha = { rota, desempenho: nota('performance'), acessibilidade: nota('accessibility'), boas_praticas: nota('best-practices'), seo: nota('seo'),
      fcp: a['first-contentful-paint'].displayValue, lcp: a['largest-contentful-paint'].displayValue, tbt: a['total-blocking-time'].displayValue, cls: a['cumulative-layout-shift'].displayValue,
      peso: `${Math.round(a['total-byte-weight'].numericValue / 1024)} KB` };
    linhas.push(linha);
    if (!semMeta.has(rota) && linha.desempenho < METAS.performance || linha.acessibilidade < METAS.accessibility) falhou = true;
    const avisos = Object.values(a).filter(x => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'manual');
    if (avisos.length) linha.avisos = avisos.map(x => x.id).join(', ');
    if (saida) { mkdirSync(saida, { recursive: true }); writeFileSync(join(saida, `lighthouse${rota.replace(/\//g, '-').replace(/-$/, '')}.html`), r.report); }
    await page.close();
  }
} finally { await browser.close(); server.close(); }

console.table(linhas.map(({ avisos, ...l }) => l));
for (const l of linhas) if (l.avisos) console.log(`${l.rota} — auditorias abaixo de 90: ${l.avisos}`);
console.log(`Metas: desempenho ≥ ${METAS.performance}, acessibilidade ≥ ${METAS.accessibility} (Lighthouse, celular simulado, servidor local com gzip). SEO baixo é esperado enquanto a página tiver noindex (beta).`);
if (falhou) process.exit(1);
