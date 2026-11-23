#!/usr/bin/env node
// Injeta a casca compartilhada (head, cabeçalho e rodapé de _partials/) nas páginas HTML.
// Marcadores nas páginas:
//   <!-- qb:head --> … <!-- /qb:head -->
//   <!-- qb:header active="pdf" --> … <!-- /qb:header -->
//   <!-- qb:footer --> … <!-- /qb:footer -->
// Uso: node tools/shell.mjs           → reescreve as páginas
//      node tools/shell.mjs --check   → só confere; sai com erro se alguma página estiver fora de sincronia
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const check = process.argv.includes('--check');
const site = JSON.parse(readFileSync(join(root, '_partials/site.json'), 'utf8'));
const part = name => readFileSync(join(root, '_partials', name), 'utf8').trimEnd();
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function fill(tpl, vars) { return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw Error(`variável sem valor: ${k}`); return vars[k]; }); }
function nav(active) { return site.nav.map(n => `<a href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join(''); }
const tools = site.nav.filter(n => n.footer).map(n => `<li><a href="${n.href}">${esc(n.footer)}</a></li>`).join('');
const apps = site.apps.map(a => a.href ? `<li><a href="${a.href}" rel="noopener noreferrer">${esc(a.label)}</a></li>` : `<li><span class="qb-soon">${esc(a.label)}</span></li>`).join('');

const blocks = {
  head: () => fill(part('head.html'), { v: site.version }),
  header: attrs => {
    const active = /active="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (active && !site.nav.some(n => n.id === active)) throw Error(`active="${active}" não existe em site.json`);
    return fill(part('header.html'), { v: site.version, nav: nav(active) });
  },
  footer: () => fill(part('footer.html'), { v: site.version, tagline: esc(site.tagline), tools, apps })
};

function pages(dir) {
  return readdirSync(dir).flatMap(name => {
    if (name.startsWith('.') || name.startsWith('_') || name === 'node_modules' || name === 'tools' || name === 'tests' || name === 'assets') return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? pages(p) : name.endsWith('.html') ? [p] : [];
  });
}

let stale = 0, missing = 0;
for (const file of pages(root)) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [name, render] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- qb:${name}((?: [^>]*?)?) -->)[\\s\\S]*?(<!-- /qb:${name} -->)`, 'g');
    if (!re.test(before)) { console.error(`sem marcador qb:${name}: ${relative(root, file)}`); missing++; continue; }
    after = after.replace(re, (_, open, attrs, close) => `${open}\n${render(attrs)}\n${close}`);
  }
  if (after !== before) {
    stale++;
    if (check) console.error(`fora de sincronia: ${relative(root, file)}`);
    else { writeFileSync(file, after); console.log(`atualizado: ${relative(root, file)}`); }
  }
}
if (missing) process.exit(1);
if (check && stale) { console.error('Rode: node tools/shell.mjs'); process.exit(1); }
if (check) console.log('Casca compartilhada em sincronia.');
