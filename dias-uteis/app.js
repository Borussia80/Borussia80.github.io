// Dias úteis e feriados — interface. O cálculo está em /lib/dias-uteis.js (testado em tests/dias-uteis.test.mjs).
import {
  criarCalendario, somarDiasUteis, contarDiasUteis, diasCorridos, feriadosNoPeriodo, resumoDoAno,
  lerData, formatarData, diaDaSemana, ehDiaUtil, DIAS_SEMANA, TIPOS
} from '/lib/dias-uteis.js?v=1';

const UFS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CHAVE = 'qb.dias-uteis.v1';
const $ = id => document.getElementById(id);
const el = { mapa: $('mapa'), uf: $('uf'), ano: $('ano'), lista: $('lista'), total: $('total'), meses: $('meses'), status: $('status'),
  sIni: $('s-inicio'), sN: $('s-n'), sOut: $('s-out'), sMeio: $('s-meio'), sCopiar: $('s-copiar'),
  cIni: $('c-inicio'), cFim: $('c-fim'), cOut: $('c-out'), cMeio: $('c-meio'), cCopiar: $('c-copiar'),
  oInicio: $('o-inicio'), oCinzas: $('o-cinzas'), oExtras: $('o-extras'), csv: $('csv'), ics: $('ics') };

let dados = null, cal = null;
const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const estado = { uf: '', ano: +hoje.slice(0, 4), cinzas: false, incluirInicio: false, extras: '' };

function status(msg, tipo) {
  if (window.QB?.status) window.QB.status(el.status, msg, tipo);
  else el.status.textContent = msg;
}
function ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; } }
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify({ uf: estado.uf, cinzas: estado.cinzas, incluirInicio: estado.incluirInicio, extras: estado.extras })); } catch { /* modo privado: segue sem salvar */ }
  const url = new URL(location.href);
  url.search = '';
  if (estado.uf) url.searchParams.set('uf', estado.uf);
  url.searchParams.set('ano', estado.ano);
  history.replaceState(null, '', url);
}

function extras() {
  const out = [], ruins = [];
  for (const linha of estado.extras.split('\n')) {
    const t = linha.trim(); if (!t) continue;
    const [data, ...resto] = t.split(/\s+/);
    const iso = lerData(data);
    if (iso) out.push({ data: iso, nome: resto.join(' ') || 'Folga extra' }); else ruins.push(data);
  }
  return { out, ruins };
}

function recalcularCalendario() {
  const { out, ruins } = extras();
  cal = criarCalendario(dados, { uf: estado.uf || null, cinzasNaoUtil: estado.cinzas, extras: out });
  if (ruins.length) status(`Folga extra ignorada (data inválida): ${ruins.join(', ')}. Use DD/MM/AAAA.`, 'error');
  else status('');
}

// ---------- Mapa ----------
function marcarMapa() {
  el.mapa.querySelectorAll('.uf').forEach(g => g.setAttribute('aria-pressed', String(g.dataset.uf === estado.uf)));
}
function escolherUF(uf) {
  estado.uf = uf;
  el.uf.value = uf;
  marcarMapa(); tudo();
}
async function carregarMapa() {
  try {
    const r = await fetch('./mapa-br.svg?v=2');
    if (!r.ok) throw new Error(r.status);
    el.mapa.innerHTML = await r.text();
    el.mapa.removeAttribute('aria-busy');
    el.mapa.addEventListener('click', e => { const g = e.target.closest('.uf'); if (g) escolherUF(g.dataset.uf === estado.uf ? '' : g.dataset.uf); });
    el.mapa.addEventListener('keydown', e => {
      const g = e.target.closest('.uf'); if (!g) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolherUF(g.dataset.uf === estado.uf ? '' : g.dataset.uf); }
    });
    marcarMapa();
  } catch {
    el.mapa.innerHTML = '<p class="qb-help">Não foi possível carregar o mapa. Use a lista de estados abaixo.</p>';
    el.mapa.removeAttribute('aria-busy');
  }
}

// ---------- Lista do ano ----------
function linhasDoAno() {
  return feriadosNoPeriodo(`${estado.ano}-01-01`, `${estado.ano}-12-31`, cal);
}
function rotuloTipo(f) { return TIPOS[f.tipo] ?? f.tipo; }
function renderAno() {
  const linhas = linhasDoAno();
  el.lista.replaceChildren(...linhas.map(f => {
    const tr = document.createElement('tr');
    if (f.fimDeSemana) tr.className = 'is-fds';
    else if (!f.naoUtil) tr.className = 'is-util';
    const td = (t, c) => { const x = document.createElement('td'); x.textContent = t; if (c) x.className = c; return x; };
    const tipo = document.createElement('td');
    const b = document.createElement('span'); b.className = `du-tipo du-tipo--${f.tipo}`; b.textContent = rotuloTipo(f); tipo.append(b);
    tr.append(td(formatarData(f.data), 'qb-mono'), td(DIAS_SEMANA[f.semana].replace('-feira', '')), td(f.nome + (f.fimDeSemana ? ' (fim de semana)' : !f.naoUtil ? ' (dia útil)' : '')), tipo);
    return tr;
  }));
  if (!linhas.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4; td.textContent = 'Nenhum feriado.'; tr.append(td); el.lista.append(tr); }
  const r = resumoDoAno(estado.ano, cal);
  const emDiaUtil = linhas.filter(f => f.naoUtil).length;
  el.total.innerHTML = '';
  el.total.append(`${r.total} dias úteis em ${estado.ano} · ${emDiaUtil} feriados em dia de semana · ${estado.uf ? UFS[estado.uf] : 'só nacionais'}`);
  const max = Math.max(...r.meses.map(m => m.uteis));
  el.meses.replaceChildren(...r.meses.map(m => {
    const d = document.createElement('div'); d.className = 'du-mes';
    d.innerHTML = `<span class="du-mes-barra" style="--h:${(m.uteis / max).toFixed(3)}"></span><b>${m.uteis}</b><span>${MESES[m.mes - 1]}</span>`;
    d.title = `${MESES[m.mes - 1]}: ${m.uteis} dias úteis`;
    return d;
  }));
}

// ---------- Calculadoras ----------
function itensNoMeio(lista, ul) {
  ul.replaceChildren(...lista.filter(f => f.naoUtil).map(f => {
    const li = document.createElement('li');
    li.textContent = `${formatarData(f.data)} (${DIAS_SEMANA[f.semana].replace('-feira', '')}) · ${f.nome}`;
    return li;
  }));
}
const op = () => ({ incluirInicio: estado.incluirInicio });
function plural(n, s, p) { return `${n} ${Math.abs(n) === 1 ? s : p}`; }

let textoSomar = '', textoContar = '';
function calcSomar() {
  const ini = el.sIni.value, n = Number(el.sN.value);
  el.sCopiar.disabled = true; el.sMeio.replaceChildren(); textoSomar = '';
  if (!ini || !Number.isInteger(n)) { el.sOut.textContent = 'Informe a data inicial e um número inteiro de dias.'; return; }
  try {
    const r = somarDiasUteis(ini, n, cal, op());
    const sem = DIAS_SEMANA[diaDaSemana(r)];
    el.sOut.innerHTML = '';
    const b = document.createElement('b'); b.className = 'du-data'; b.textContent = formatarData(r);
    const s = document.createElement('span'); s.className = 'du-sub'; s.textContent = `${sem} · ${plural(Math.abs(diasCorridos(ini, r)), 'dia corrido', 'dias corridos')}`;
    el.sOut.append(b, s);
    const [a, z] = ini <= r ? [ini, r] : [r, ini];
    itensNoMeio(feriadosNoPeriodo(a, z, cal), el.sMeio);
    textoSomar = `${formatarData(ini)} ${n >= 0 ? '+' : '−'} ${plural(Math.abs(n), 'dia útil', 'dias úteis')} = ${formatarData(r)} (${sem}) · ${estado.uf ? UFS[estado.uf] : 'feriados nacionais'}`;
    el.sCopiar.disabled = false;
  } catch (e) { el.sOut.textContent = e.message; }
}
function calcContar() {
  const a = el.cIni.value, z = el.cFim.value;
  el.cCopiar.disabled = true; el.cMeio.replaceChildren(); textoContar = '';
  if (!a || !z) { el.cOut.textContent = 'Informe as duas datas.'; return; }
  try {
    const n = contarDiasUteis(a, z, cal, op());
    const corridos = diasCorridos(a, z);
    el.cOut.innerHTML = '';
    const b = document.createElement('b'); b.className = 'du-data'; b.textContent = plural(n, 'dia útil', 'dias úteis');
    const s = document.createElement('span'); s.className = 'du-sub'; s.textContent = plural(Math.abs(corridos), 'dia corrido', 'dias corridos');
    el.cOut.append(b, s);
    const [x, y] = a <= z ? [a, z] : [z, a];
    itensNoMeio(feriadosNoPeriodo(x, y, cal), el.cMeio);
    textoContar = `De ${formatarData(a)} a ${formatarData(z)}: ${plural(n, 'dia útil', 'dias úteis')} (${plural(Math.abs(corridos), 'dia corrido', 'dias corridos')}) · ${estado.uf ? UFS[estado.uf] : 'feriados nacionais'}`;
    el.cCopiar.disabled = false;
  } catch (e) { el.cOut.textContent = e.message; }
}

function tudo() { recalcularCalendario(); renderAno(); calcSomar(); calcContar(); salvar(); }

// ---------- Exportar ----------
function baixar(nome, tipo, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const sufixo = () => `${estado.uf || 'BR'}-${estado.ano}`;
function exportarCSV() {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const linhas = [['data', 'dia_da_semana', 'feriado', 'tipo', 'dia_util'].join(';'),
    ...linhasDoAno().map(f => [formatarData(f.data), DIAS_SEMANA[f.semana], q(f.nome), q(rotuloTipo(f)), f.naoUtil || f.fimDeSemana ? 'não' : 'sim'].join(';'))];
  baixar(`feriados-${sufixo()}.csv`, 'text/csv;charset=utf-8', '﻿' + linhas.join('\r\n') + '\r\n');
}
function exportarICS() {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = linhasDoAno().map(f => {
    const d = f.data.replace(/-/g, '');
    const prox = somarUmDia(f.data).replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:${d}-${estado.uf || 'BR'}-${f.tipo}@ferramentas.quebec.com.br`, `DTSTAMP:${carimbo}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${prox}`,
      `SUMMARY:${esc(f.nome)}`, `DESCRIPTION:${esc(rotuloTipo(f))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//quebec//ferramentas dias-uteis//PT-BR', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(`Feriados ${estado.uf ? UFS[estado.uf] : 'nacionais'} ${estado.ano}`)}`, ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  baixar(`feriados-${sufixo()}.ics`, 'text/calendar;charset=utf-8', ics);
}
function somarUmDia(iso) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }

// ---------- Início ----------
async function iniciar() {
  for (const [sigla, nome] of Object.entries(UFS).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))) el.uf.append(new Option(`${nome} (${sigla})`, sigla));
  const salvo = ler();
  const url = new URL(location.href);
  const ufUrl = (url.searchParams.get('uf') || '').toUpperCase();
  estado.uf = UFS[ufUrl] ? ufUrl : UFS[salvo.uf] ? salvo.uf : '';
  estado.cinzas = !!salvo.cinzas; estado.incluirInicio = !!salvo.incluirInicio; estado.extras = typeof salvo.extras === 'string' ? salvo.extras : '';
  el.uf.value = estado.uf; el.oCinzas.checked = estado.cinzas; el.oInicio.checked = estado.incluirInicio; el.oExtras.value = estado.extras;
  if (estado.extras) $('opcoes').open = true;

  const mapa = carregarMapa();
  try {
    const r = await fetch('./feriados-br.json?v=1');
    if (!r.ok) throw new Error(r.status);
    dados = await r.json();
  } catch {
    status('Não foi possível carregar a base de feriados. Recarregue a página.', 'error');
    return;
  }
  for (let a = dados.anos[0]; a <= dados.anos[1]; a++) el.ano.append(new Option(String(a), String(a)));
  const anoUrl = +url.searchParams.get('ano');
  estado.ano = anoUrl >= dados.anos[0] && anoUrl <= dados.anos[1] ? anoUrl : Math.min(Math.max(estado.ano, dados.anos[0]), dados.anos[1]);
  el.ano.value = String(estado.ano);

  const base = hoje >= `${dados.anos[0]}-01-01` && hoje <= `${dados.anos[1]}-12-31` ? hoje : `${estado.ano}-01-02`;
  el.sIni.value = base; el.cIni.value = base;
  el.cFim.value = `${base.slice(0, 4)}-12-31`;

  el.uf.addEventListener('change', () => escolherUF(el.uf.value));
  el.ano.addEventListener('change', () => { estado.ano = +el.ano.value; tudo(); });
  el.oCinzas.addEventListener('change', () => { estado.cinzas = el.oCinzas.checked; tudo(); });
  el.oInicio.addEventListener('change', () => { estado.incluirInicio = el.oInicio.checked; tudo(); });
  el.oExtras.addEventListener('change', () => { estado.extras = el.oExtras.value; tudo(); });
  for (const i of [el.sIni, el.sN]) i.addEventListener('input', calcSomar);
  for (const i of [el.cIni, el.cFim]) i.addEventListener('input', calcContar);
  el.sCopiar.addEventListener('click', () => window.QB?.copy(el.sCopiar, textoSomar));
  el.cCopiar.addEventListener('click', () => window.QB?.copy(el.cCopiar, textoContar));
  el.csv.addEventListener('click', exportarCSV);
  el.ics.addEventListener('click', exportarICS);
  tudo();
  await mapa;
  marcarMapa();
  document.documentElement.dataset.duPronto = '1';
}
iniciar();
// Exposto só para os testes e2e.
window.__diasUteis = { estado, ehDiaUtil: d => ehDiaUtil(d, cal) };
