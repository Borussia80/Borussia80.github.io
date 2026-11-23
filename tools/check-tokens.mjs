#!/usr/bin/env node
// Falha se algum var(--x) usado em CSS/HTML/JS do site não tiver definição em lugar nenhum.
// Sem fallback, o navegador descarta a declaração inteira — foi assim que --space-5/10/20 sumiram em silêncio na 1.1.1.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = (function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    if (n.startsWith('.') || n === 'node_modules' || n === 'tools') return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(css|html|js|mjs)$/.test(n) ? [p] : [];
  });
})(root);

const defined = new Set(), used = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) used.push({ name: m[1], fallback: !!m[2], file: relative(root, f) });
}
const missing = used.filter(u => !defined.has(u.name) && !u.fallback);
for (const u of missing) console.error(`token sem definição: ${u.name} em ${u.file}`);
if (missing.length) process.exit(1);
console.log(`Tokens OK: ${new Set(used.map(u => u.name)).size} variáveis usadas, todas definidas.`);
