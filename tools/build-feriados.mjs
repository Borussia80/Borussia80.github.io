#!/usr/bin/env node
// Gera dias-uteis/feriados-br.json a partir do date-holidays (código ISC; dados CC BY-SA 4.0).
// O navegador só carrega o JSON; a biblioteca roda apenas aqui, no build.
//
// Uso:  npm install --no-save --no-package-lock date-holidays@3.39.2
//       node tools/build-feriados.mjs           → grava o JSON
//       node tools/build-feriados.mjs --check   → regera em memória e falha se o JSON versionado estiver diferente
//
// Critério (decisão de 25/11/2026, registrada em gestao_sites/sites/ferramentas-quebec):
//   public               → feriado (nacional ou estadual)
//   Carnaval seg/ter e Corpus Christi (bank no date-holidays) → feriado, tipo "f" (facultativo tratado como feriado)
//   Quarta-feira de Cinzas (optional, meio período) → tipo "c" (facultativo; útil por padrão)
//   demais optional e observance → fora (Dia das Mães, véspera de Natal às 14h etc.)
// Ajustes manuais, sempre com fonte, ficam em dias-uteis/feriados-ajustes.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const VERSAO_LIB = '3.39.2';
const ANOS = [2020, 2035];
const root = new URL('..', import.meta.url).pathname;
const saida = join(root, 'dias-uteis/feriados-br.json');
const ajustes = JSON.parse(readFileSync(join(root, 'dias-uteis/feriados-ajustes.json'), 'utf8'));
const check = process.argv.includes('--check');

const require = createRequire(join(root, 'package.json'));
let Holidays;
try { Holidays = require('date-holidays'); } catch {
  console.error(`Instale antes: npm install --no-save --no-package-lock date-holidays@${VERSAO_LIB}`);
  process.exit(1);
}
const versao = require('date-holidays/package.json').version;
if (versao !== VERSAO_LIB) { console.error(`date-holidays ${versao} instalado; esperado ${VERSAO_LIB}.`); process.exit(1); }

const NOMES = { 'Corpo de Deus': 'Corpus Christi', 'Dia do trabalhador': 'Dia do Trabalho' };
const iso = h => h.date.slice(0, 10);

function classificar(h) {
  const nome = NOMES[h.name] ?? h.name;
  if (h.type === 'public') return { nome, tipo: 'n' };
  if (h.type === 'bank' && /^easter (-48|-47|60)$/.test(h.rule)) return { nome, tipo: 'f' };
  if (h.type === 'optional' && /^easter -46\b/.test(h.rule)) return { nome: 'Quarta-feira de Cinzas', tipo: 'c' };
  return null;
}

function lista(hd, ano) {
  const out = new Map();
  for (const h of hd.getHolidays(ano)) {
    const c = classificar(h);
    if (!c) continue;
    const d = iso(h);
    if (!out.has(d)) out.set(d, [d, c.nome, c.tipo]);
  }
  return out;
}

function aplicarAjustes(mapa, uf, ano) {
  for (const a of ajustes.itens) {
    if ((a.uf ?? null) !== uf) continue;
    if (a.desde && ano < a.desde) continue;
    if (a.ate && ano > a.ate) continue;
    const d = `${ano}-${a.mmdd}`;
    if (a.acao === 'remover') {
      if (a.mmdd) mapa.delete(d);
      else for (const [k, v] of mapa) if (v[1] === a.nome) mapa.delete(k);
    } else if (a.acao === 'adicionar') {
      mapa.set(d, [d, a.nome, uf ? 'e' : 'n']);
    }
  }
}

const nacional = {}, estados = {};
const br = new Holidays('BR');
const ufs = Object.keys(br.getStates('BR')).sort();
for (let ano = ANOS[0]; ano <= ANOS[1]; ano++) {
  const nac = lista(br, ano);
  aplicarAjustes(nac, null, ano);
  nacional[ano] = [...nac.values()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const uf of ufs) {
    const est = lista(new Holidays('BR', uf), ano);
    for (const d of nac.keys()) est.delete(d); // mesma data já é nacional
    for (const [d, v] of est) if (v[2] === 'n') v[2] = 'e';
    aplicarAjustes(est, uf, ano);
    (estados[uf] ??= {})[ano] = [...est.values()].sort((a, b) => a[0].localeCompare(b[0]));
  }
}

const dados = {
  fonte: `date-holidays ${VERSAO_LIB} (https://github.com/commenthol/date-holidays), com ajustes em feriados-ajustes.json`,
  licenca: 'Dados sob CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), derivados de date-holidays/Wikipédia',
  tipos: { n: 'feriado nacional', e: 'feriado estadual', f: 'ponto facultativo nacional tratado como feriado', c: 'ponto facultativo (Quarta-feira de Cinzas)' },
  anos: ANOS,
  nacional,
  uf: estados
};
const texto = JSON.stringify(dados).replace(/\],\[/g, '],\n[') + '\n';

if (check) {
  let atual = '';
  try { atual = readFileSync(saida, 'utf8'); } catch {}
  if (atual !== texto) { console.error('dias-uteis/feriados-br.json desatualizado. Rode: node tools/build-feriados.mjs'); process.exit(1); }
  console.log('Base de feriados em sincronia.');
} else {
  writeFileSync(saida, texto);
  console.log(`gravado: dias-uteis/feriados-br.json (${(texto.length / 1024).toFixed(1)} KB, ${ufs.length} UFs, ${ANOS[0]}–${ANOS[1]})`);
}
