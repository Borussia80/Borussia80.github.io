#!/usr/bin/env node
// Conferência cruzada: dias-uteis/feriados-br.json × joaopbini/feriados-brasil (MIT), anos em comum.
// Só datas que caem de segunda a sexta entram na comparação: fim de semana não muda nenhum cálculo.
//
// Uso:  git clone https://github.com/joaopbini/feriados-brasil /tmp/feriados-ref
//       (cd /tmp/feriados-ref && git checkout f89f5bd7eac7397b477beb0dd5ce26d5d2449919)
//       FERIADOS_REF=/tmp/feriados-ref node tests/feriados-cruzado.mjs            → grava tests/relatorio-feriados.md
//       FERIADOS_REF=/tmp/feriados-ref node tests/feriados-cruzado.mjs --check    → falha se surgir divergência fora de tests/feriados-divergencias.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ref = process.env.FERIADOS_REF;
if (!ref || !existsSync(join(ref, 'dados/feriados'))) { console.error('Defina FERIADOS_REF com o clone de joaopbini/feriados-brasil.'); process.exit(1); }
const check = process.argv.includes('--check');
const base = JSON.parse(readFileSync(join(root, 'dias-uteis/feriados-br.json'), 'utf8'));
const conhecidas = JSON.parse(readFileSync(join(root, 'tests/feriados-divergencias.json'), 'utf8'));

const util = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; };
const isoBR = s => { const [d, m, a] = s.split('/'); return `${a}-${m}-${d}`; };
const ler = (tipo, ano) => { const f = join(ref, `dados/feriados/${tipo}/json/${ano}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const ufs = Object.keys(base.uf).sort();

const divergencias = [];
let anosComparados = [];
for (let ano = base.anos[0]; ano <= base.anos[1]; ano++) {
  const nac = ler('nacional', ano), est = ler('estadual', ano), fac = ler('facultativo', ano);
  if (!nac || !est) continue;
  anosComparados.push(ano);
  // Nacional: feriados "n" e os facultativos tratados como feriado ("f") contra nacional + Carnaval/Corpus da referência.
  const nossoNac = new Map(base.nacional[ano].filter(([d, , t]) => (t === 'n' || t === 'f') && util(d)).map(([d, n]) => [d, n]));
  const refNac = new Map(nac.map(x => [isoBR(x.data), x.nome]));
  for (const x of fac ?? []) if (!x.uf && /Carnaval|Corpus/i.test(x.nome) && !/Quarta/i.test(x.nome)) {
    const d = isoBR(x.data); if (!/Cinzas/.test(x.nome) && nossoNac.has(d)) refNac.set(d, x.nome);
  }
  for (const [d, n] of refNac) if (util(d) && !nossoNac.has(d)) divergencias.push({ chave: `${d}|BR|so-ref`, ano, uf: 'BR', data: d, nome: n, lado: 'só na referência' });
  for (const [d, n] of nossoNac) if (!refNac.has(d)) divergencias.push({ chave: `${d}|BR|so-nosso`, ano, uf: 'BR', data: d, nome: n, lado: 'só na nossa base' });
  // Estadual.
  for (const uf of ufs) {
    const nosso = new Map(base.uf[uf][ano].filter(([d]) => util(d)).map(([d, n]) => [d, n]));
    const r = new Map(est.filter(x => x.uf === uf).map(x => [isoBR(x.data), x.nome]).filter(([d]) => util(d) && !nossoNac.has(d)));
    for (const [d, n] of r) if (!nosso.has(d)) divergencias.push({ chave: `${d}|${uf}|so-ref`, ano, uf, data: d, nome: n, lado: 'só na referência' });
    for (const [d, n] of nosso) if (!r.has(d)) divergencias.push({ chave: `${d}|${uf}|so-nosso`, ano, uf, data: d, nome: n, lado: 'só na nossa base' });
  }
}

// Agrupa por (UF, nome, lado) para o relatório ficar legível.
const grupos = new Map();
for (const v of divergencias) {
  const k = `${v.uf}|${v.nome}|${v.lado}`;
  if (!grupos.has(k)) grupos.set(k, { ...v, anos: [] });
  grupos.get(k).anos.push(v.ano);
}
if (process.argv.includes('--chaves')) { console.log(JSON.stringify(divergencias.map(v => v.chave))); process.exit(0); }
const novas = divergencias.filter(v => !conhecidas.chaves.includes(v.chave));

if (check) {
  if (novas.length) { for (const v of novas) console.error(`divergência nova: ${v.uf} ${v.data} ${v.nome} (${v.lado})`); process.exit(1); }
  console.log(`Conferência cruzada: ${divergencias.length} divergências em dias úteis, todas já revisadas (${anosComparados[0]}–${anosComparados.at(-1)}).`);
} else {
  const notas = conhecidas.notas ?? {};
  const linhas = [...grupos.values()].sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome)).map(g => {
    const k = `${g.uf}|${g.nome}`;
    return `| ${g.uf} | ${g.nome} | ${g.lado} | ${g.anos.join(', ')} | ${notas[k] ?? 'a revisar'} |`;
  });
  const md = `# Conferência cruzada de feriados\n\nGerado por \`tests/feriados-cruzado.mjs\`. Base: \`dias-uteis/feriados-br.json\`. Referência: [joaopbini/feriados-brasil](https://github.com/joaopbini/feriados-brasil) (MIT), commit \`f89f5bd\`. Anos comparados: ${anosComparados[0]}–${anosComparados.at(-1)}. Só entram datas de segunda a sexta.\n\n**${divergencias.length} divergências** (${grupos.size} grupos). A coluna "Classificação" vem de \`tests/feriados-divergencias.json\`.\n\n| UF | Feriado | Lado | Anos | Classificação |\n| --- | --- | --- | --- | --- |\n${linhas.join('\n')}\n`;
  writeFileSync(join(root, 'tests/relatorio-feriados.md'), md);
  console.log(`relatório: ${divergencias.length} divergências, ${grupos.size} grupos, ${novas.length} ainda não registradas.`);
}
