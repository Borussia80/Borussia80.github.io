// Motor de dias úteis — compartilhado entre /dias-uteis/ e /gantt/.
// Funções puras, sem DOM. Datas são datas civis no formato ISO 'AAAA-MM-DD'; a aritmética usa
// número de dias desde 1970-01-01 calculado em UTC, então o resultado não depende do fuso do aparelho.
//
// Uso:
//   import { criarCalendario, somarDiasUteis, contarDiasUteis } from '/lib/dias-uteis.js';
//   const dados = await (await fetch('/dias-uteis/feriados-br.json')).json();
//   const cal = criarCalendario(dados, { uf: 'BA' });
//   somarDiasUteis('2026-11-19', 1, cal)   // '2026-11-23'
//
// Regra de contagem padrão: o dia inicial não conta (incluirInicio: false). Com incluirInicio: true,
// o dia inicial conta como o primeiro, se for útil.
// Tipos de dia da base: n nacional, e estadual, f facultativo tratado como feriado (Carnaval, Corpus Christi),
// c Quarta-feira de Cinzas (útil por padrão; não útil com cinzasNaoUtil: true).

const DIA_MS = 86400000;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const TIPOS = { n: 'Nacional', e: 'Estadual', f: 'Facultativo tratado como feriado', c: 'Facultativo', x: 'Folga extra' };

/** 'AAAA-MM-DD' → número do dia (inteiro). Lança erro se a data não existir. */
export function paraDia(iso) {
  const m = RE_ISO.exec(iso);
  if (!m) throw new TypeError(`Data inválida: ${iso}`);
  const a = +m[1], mes = +m[2], d = +m[3];
  const t = Date.UTC(a, mes - 1, d);
  const v = new Date(t);
  if (v.getUTCFullYear() !== a || v.getUTCMonth() !== mes - 1 || v.getUTCDate() !== d) throw new RangeError(`Data inexistente: ${iso}`);
  return Math.round(t / DIA_MS);
}

/** número do dia → 'AAAA-MM-DD' */
export function deDia(n) {
  const v = new Date(n * DIA_MS);
  return `${String(v.getUTCFullYear()).padStart(4, '0')}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(iso) { return ((paraDia(iso) % 7) + 7 + 4) % 7; }

/** Aceita 'AAAA-MM-DD' ou 'DD/MM/AAAA'; devolve ISO ou null. */
export function lerData(texto) {
  const s = String(texto ?? '').trim();
  let iso = null;
  if (RE_ISO.test(s)) iso = s;
  else { const m = RE_BR.exec(s); if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (!iso) return null;
  try { paraDia(iso); return iso; } catch { return null; }
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' */
export function formatarData(iso) { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }

/**
 * Monta o calendário de uma UF a partir da base de feriados.
 * @param {object} dados  conteúdo de feriados-br.json
 * @param {object} op     { uf?: 'BA', cinzasNaoUtil?: false, fimDeSemana?: [0, 6], extras?: [{ data, nome }] }
 */
export function criarCalendario(dados, op = {}) {
  const { uf = null, cinzasNaoUtil = false, fimDeSemana = [0, 6], extras = [] } = op;
  if (uf && !dados.uf[uf]) throw new RangeError(`UF desconhecida: ${uf}`);
  const feriados = new Map();
  for (const [ano, lista] of Object.entries(dados.nacional)) {
    for (const [d, nome, tipo] of lista) feriados.set(d, { data: d, nome, tipo });
    if (uf) for (const [d, nome, tipo] of dados.uf[uf][ano] ?? []) if (!feriados.has(d)) feriados.set(d, { data: d, nome, tipo });
  }
  for (const x of extras) {
    const d = lerData(x.data);
    if (d) feriados.set(d, { data: d, nome: x.nome || 'Folga extra', tipo: 'x' });
  }
  const naoUtil = new Set();
  for (const [d, f] of feriados) if (f.tipo !== 'c' || cinzasNaoUtil) naoUtil.add(d);
  return {
    uf, cinzasNaoUtil,
    fimDeSemana: new Set(fimDeSemana),
    anos: [dados.anos[0], dados.anos[1]],
    inicio: paraDia(`${dados.anos[0]}-01-01`),
    fim: paraDia(`${dados.anos[1]}-12-31`),
    feriados, naoUtil
  };
}

function dentro(cal, n) {
  if (n < cal.inicio || n > cal.fim) throw new RangeError(`A base de feriados cobre ${cal.anos[0]} a ${cal.anos[1]}.`);
}
function util(cal, n) { return !cal.fimDeSemana.has(((n % 7) + 11) % 7) && !cal.naoUtil.has(deDia(n)); }

/** O dia é útil neste calendário? */
export function ehDiaUtil(iso, cal) { const n = paraDia(iso); dentro(cal, n); return util(cal, n); }

/** Feriado ou folga da data (ou null). */
export function feriadoEm(iso, cal) { return cal.feriados.get(iso) ?? null; }

/**
 * Soma (ou subtrai, com n negativo) dias úteis.
 * Padrão: o dia inicial não conta; devolve o n-ésimo dia útil depois (ou antes) dele.
 * incluirInicio: o dia inicial, se útil, é o primeiro. n = 0 devolve a própria data.
 */
export function somarDiasUteis(iso, n, cal, { incluirInicio = false } = {}) {
  if (!Number.isInteger(n)) throw new TypeError('Quantidade de dias deve ser inteira.');
  let d = paraDia(iso);
  dentro(cal, d);
  if (n === 0) return iso;
  const passo = n > 0 ? 1 : -1;
  let faltam = Math.abs(n);
  if (incluirInicio && util(cal, d)) { faltam--; if (!faltam) return iso; }
  while (faltam > 0) { d += passo; dentro(cal, d); if (util(cal, d)) faltam--; }
  return deDia(d);
}

/**
 * Conta dias úteis entre duas datas.
 * Padrão: intervalo (inicio, fim] — o dia inicial não conta, o final conta.
 * incluirInicio: [inicio, fim]. Se fim < inicio, o resultado é negativo e simétrico.
 */
export function contarDiasUteis(inicio, fim, cal, { incluirInicio = false } = {}) {
  let a = paraDia(inicio), b = paraDia(fim);
  dentro(cal, a); dentro(cal, b);
  if (b < a) return -contarDiasUteis(fim, inicio, cal, { incluirInicio });
  let total = 0;
  for (let d = incluirInicio ? a : a + 1; d <= b; d++) if (util(cal, d)) total++;
  return total;
}

/** Dias corridos entre duas datas (fim − inicio). */
export function diasCorridos(inicio, fim) { return paraDia(fim) - paraDia(inicio); }

/** Feriados e folgas de um intervalo fechado, em ordem, com dia da semana e se tiram dia útil. */
export function feriadosNoPeriodo(inicio, fim, cal) {
  const a = paraDia(inicio), b = paraDia(fim);
  const out = [];
  for (const f of cal.feriados.values()) {
    const n = paraDia(f.data);
    if (n < a || n > b) continue;
    const semana = ((n % 7) + 11) % 7;
    out.push({ ...f, semana, fimDeSemana: cal.fimDeSemana.has(semana), naoUtil: cal.naoUtil.has(f.data) && !cal.fimDeSemana.has(semana) });
  }
  return out.sort((x, y) => x.data.localeCompare(y.data));
}

/** Resumo do ano: dias úteis por mês e total. */
export function resumoDoAno(ano, cal) {
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const ini = paraDia(`${ano}-${String(m).padStart(2, '0')}-01`);
    const fimMes = m === 12 ? paraDia(`${ano}-12-31`) : paraDia(`${ano}-${String(m + 1).padStart(2, '0')}-01`) - 1;
    let uteis = 0;
    for (let d = ini; d <= fimMes; d++) if (util(cal, d)) uteis++;
    meses.push({ mes: m, uteis, dias: fimMes - ini + 1 });
  }
  return { ano, meses, total: meses.reduce((s, x) => s + x.uteis, 0) };
}
