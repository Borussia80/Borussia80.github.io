// Mini-Gantt — agendamento (sem DOM). Testado em tests/gantt.test.mjs.
// Usa o mesmo motor da calculadora de dias úteis (lib/dias-uteis.js), então feriados e opções são os mesmos.
//
// Regras:
//   - "du" (dias úteis): a tarefa começa num dia útil e o dia de início conta como o 1º dia.
//     10du começando em 19/11/2026 na BA termina em 03/12/2026 (20/11 é feriado).
//   - "d" (dias corridos): começa na data e conta todos os dias.
//   - Marco (duração 0): um dia, sem duração; na regra "du" cai num dia útil.
//   - Dependência é término → início: a tarefa começa no dia (útil, se "du") seguinte ao fim da última dependência.
//     Se ela também tem data de início, vale a mais tarde das duas.
//   - Sem data e sem dependência: começa no início do projeto.
//   - Folga (em dias úteis) e caminho crítico pelo método do caminho crítico (CPM), ida e volta.
import { somarDiasUteis, contarDiasUteis, ehDiaUtil, paraDia, deDia, diasCorridos } from '../lib/dias-uteis.js';

const maisDias = (iso, n) => deDia(paraDia(iso) + n);
const maior = (a, b) => (a > b ? a : b);
const menor = (a, b) => (a < b ? a : b);

function proximoUtil(iso, cal) { return ehDiaUtil(iso, cal) ? iso : somarDiasUteis(iso, 1, cal); }

function fimDe(t, inicio, cal) {
  if (t.duracao === 0) return inicio;
  return t.unidade === 'du' ? somarDiasUteis(inicio, t.duracao, cal, { incluirInicio: true }) : maisDias(inicio, t.duracao - 1);
}
function inicioDe(t, fim, cal) {
  if (t.duracao === 0) return fim;
  return t.unidade === 'du' ? somarDiasUteis(fim, -t.duracao, cal, { incluirInicio: true }) : maisDias(fim, -(t.duracao - 1));
}
/** Primeiro dia em que um sucessor pode começar depois de `fim`. */
function depoisDe(fim, t, cal) { return t.unidade === 'du' || t.duracao === 0 ? somarDiasUteis(fim, 1, cal) : maisDias(fim, 1); }
/** Último dia (corrido) em que um predecessor pode terminar para o sucessor começar em `inicio`.
 *  Se o predecessor é em dias úteis, o chamador recua esse fim para o dia útil anterior. */
function antesDe(inicio) { return maisDias(inicio, -1); }

/** Ordem topológica (Kahn). Devolve { ordem } ou { ciclo: [id, ...] }. */
export function ordenar(tarefas) {
  const grau = new Map(tarefas.map(t => [t.id, t.deps.length]));
  const suc = new Map(tarefas.map(t => [t.id, []]));
  for (const t of tarefas) for (const d of t.deps) suc.get(d)?.push(t.id);
  const fila = tarefas.filter(t => !t.deps.length).map(t => t.id);
  const ordem = [];
  while (fila.length) {
    const id = fila.shift(); ordem.push(id);
    for (const s of suc.get(id)) { grau.set(s, grau.get(s) - 1); if (!grau.get(s)) fila.push(s); }
  }
  if (ordem.length === tarefas.length) return { ordem, suc };
  // Isola um ciclo para a mensagem de erro: anda pelas dependências entre as tarefas que sobraram.
  const resto = new Set(tarefas.filter(t => !ordem.includes(t.id)).map(t => t.id));
  const porId = new Map(tarefas.map(t => [t.id, t]));
  let atual = [...resto][0];
  const visto = [];
  while (!visto.includes(atual)) { visto.push(atual); atual = porId.get(atual).deps.find(d => resto.has(d)); }
  return { ciclo: visto.slice(visto.indexOf(atual)).reverse() };
}

/**
 * Agenda as tarefas lidas por lerLista().
 * @param {Array} tarefas
 * @param {object} cal      calendário de criarCalendario()
 * @param {object} op       { inicioProjeto: ISO } — obrigatório se alguma tarefa não tiver data nem dependência
 * @returns {{ ok: true, tarefas, projeto } | { ok: false, erro, ids }}
 */
export function agendar(tarefas, cal, { inicioProjeto = null } = {}) {
  if (!tarefas.length) return { ok: true, tarefas: [], projeto: null };
  const r = ordenar(tarefas);
  const porId = new Map(tarefas.map(t => [t.id, t]));
  if (r.ciclo) {
    const nomes = r.ciclo.map(id => porId.get(id).nome);
    return { ok: false, erro: `Dependência circular: ${[...nomes, nomes[0]].join(' → ')}`, ids: r.ciclo };
  }
  const cedo = new Map();
  try {
    // Ida: início e fim mais cedo
    for (const id of r.ordem) {
      const t = porId.get(id);
      let ini = t.inicio;
      for (const d of t.deps) { const p = depoisDe(cedo.get(d).fim, t, cal); ini = ini ? maior(ini, p) : p; }
      if (!ini) {
        if (!inicioProjeto) return { ok: false, erro: `"${t.nome}" (linha ${t.linha}) não tem data de início nem dependência. Informe a data ou o início do projeto.`, ids: [id] };
        ini = inicioProjeto;
      }
      if (t.unidade === 'du' || t.duracao === 0) ini = proximoUtil(ini, cal);
      cedo.set(id, { inicio: ini, fim: fimDe(t, ini, cal) });
    }
    const fimProjeto = [...cedo.values()].reduce((m, x) => maior(m, x.fim), '0000-00-00');
    const inicioProj = [...cedo.values()].reduce((m, x) => menor(m, x.inicio), '9999-99-99');
    // Volta: fim e início mais tarde
    const tarde = new Map();
    for (const id of [...r.ordem].reverse()) {
      const t = porId.get(id);
      let fim = fimProjeto;
      for (const s of r.suc.get(id)) fim = menor(fim, antesDe(tarde.get(s).inicio));
      if ((t.unidade === 'du' || t.duracao === 0) && !ehDiaUtil(fim, cal)) fim = somarDiasUteis(fim, -1, cal);
      tarde.set(id, { fim, inicio: inicioDe(t, fim, cal) });
    }
    const saida = tarefas.map(t => {
      const c = cedo.get(t.id), l = tarde.get(t.id);
      const folga = Math.max(0, contarDiasUteis(c.fim, l.fim, cal));
      return {
        ...t, inicio: c.inicio, fim: c.fim, inicioTarde: l.inicio, fimTarde: l.fim,
        diasUteis: t.duracao === 0 ? 0 : contarDiasUteis(c.inicio, c.fim, cal, { incluirInicio: true }),
        diasCorridos: diasCorridos(c.inicio, c.fim) + (t.duracao === 0 ? 0 : 1),
        folga, critico: folga === 0, marco: t.duracao === 0
      };
    });
    return {
      ok: true, tarefas: saida,
      projeto: { inicio: inicioProj, fim: fimProjeto, diasUteis: contarDiasUteis(inicioProj, fimProjeto, cal, { incluirInicio: true }), diasCorridos: diasCorridos(inicioProj, fimProjeto) + 1 }
    };
  } catch (e) {
    return { ok: false, erro: e.message, ids: [] };
  }
}

/** Formato do frappe-gantt (o fim do frappe é exclusivo, então soma um dia). */
export function paraFrappe(agendadas) {
  return agendadas.map(t => ({
    id: t.id, name: t.nome, start: t.inicio, end: maisDias(t.fim, 1), progress: 0,
    dependencies: t.deps.join(', '), custom_class: [t.critico ? 'is-critico' : '', t.marco ? 'is-marco' : ''].filter(Boolean).join(' ')
  }));
}
