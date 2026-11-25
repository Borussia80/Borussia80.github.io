// Matriz de Eisenhower — modelo puro (sem DOM). Toda operação devolve um estado novo; o original não muda.
// Testado em tests/eisenhower.test.mjs.
//
// Estado (versão 1):
//   { versao: 1, tarefas: [{ id, titulo, nota, quadrante: 1..4, prazo: 'AAAA-MM-DD' | null, concluida, criadaEm }] }
// A ordem dentro de cada quadrante é a ordem do array.

export const VERSAO = 1;
export const QUADRANTES = {
  1: { nome: 'Fazer agora', dica: 'Urgente e importante' },
  2: { nome: 'Agendar', dica: 'Importante, não urgente' },
  3: { nome: 'Delegar', dica: 'Urgente, não importante' },
  4: { nome: 'Eliminar', dica: 'Nem urgente nem importante' }
};
export const LIMITE_TITULO = 200;
export const LIMITE_NOTA = 2000;
export const LIMITE_TAREFAS = 2000;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const quadranteValido = q => Number.isInteger(q) && q >= 1 && q <= 4;

export function novoEstado() { return { versao: VERSAO, tarefas: [] }; }

function copia(estado) { return { versao: VERSAO, tarefas: estado.tarefas.map(t => ({ ...t })) }; }
function achar(estado, id) {
  const i = estado.tarefas.findIndex(t => t.id === id);
  if (i < 0) throw new RangeError(`Tarefa inexistente: ${id}`);
  return i;
}
function limparTitulo(t) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_TITULO);
  if (!s) throw new RangeError('A tarefa precisa de um título.');
  return s;
}
function limparPrazo(p) {
  if (p == null || p === '') return null;
  if (!RE_DATA.test(p)) throw new RangeError(`Prazo inválido: ${p}`);
  return p;
}

/** Gera um id curto e único dentro do estado. */
export function novoId(estado, aleatorio = Math.random) {
  for (;;) {
    const id = 't' + Math.floor(aleatorio() * 36 ** 8).toString(36).padStart(8, '0');
    if (!estado.tarefas.some(t => t.id === id)) return id;
  }
}

/** Cria uma tarefa no fim do quadrante. */
export function criar(estado, { titulo, quadrante = 1, nota = '', prazo = null }, { agora = new Date().toISOString(), id } = {}) {
  if (!quadranteValido(quadrante)) throw new RangeError(`Quadrante inválido: ${quadrante}`);
  if (estado.tarefas.length >= LIMITE_TAREFAS) throw new RangeError(`Limite de ${LIMITE_TAREFAS} tarefas.`);
  const e = copia(estado);
  const t = { id: id ?? novoId(e), titulo: limparTitulo(titulo), nota: String(nota ?? '').slice(0, LIMITE_NOTA), quadrante, prazo: limparPrazo(prazo), concluida: false, criadaEm: agora };
  // Entra depois da última tarefa do mesmo quadrante (ou no fim).
  let pos = e.tarefas.length;
  for (let i = e.tarefas.length - 1; i >= 0; i--) if (e.tarefas[i].quadrante === quadrante) { pos = i + 1; break; }
  e.tarefas.splice(pos, 0, t);
  return e;
}

/** Edita título, nota e/ou prazo. */
export function editar(estado, id, campos) {
  const e = copia(estado);
  const t = e.tarefas[achar(e, id)];
  if ('titulo' in campos) t.titulo = limparTitulo(campos.titulo);
  if ('nota' in campos) t.nota = String(campos.nota ?? '').slice(0, LIMITE_NOTA);
  if ('prazo' in campos) t.prazo = limparPrazo(campos.prazo);
  return e;
}

/**
 * Move a tarefa para o quadrante, na posição `indice` entre as tarefas daquele quadrante
 * (contando só as que a interface mostra, se `visiveis` for passado). Sem índice: vai para o fim.
 */
export function mover(estado, id, quadrante, indice = Infinity, visiveis = null) {
  if (!quadranteValido(quadrante)) throw new RangeError(`Quadrante inválido: ${quadrante}`);
  const e = copia(estado);
  const [t] = e.tarefas.splice(achar(e, id), 1);
  t.quadrante = quadrante;
  const destino = e.tarefas.filter(x => x.quadrante === quadrante && (!visiveis || visiveis(x)));
  let pos;
  if (indice < destino.length) pos = e.tarefas.indexOf(destino[Math.max(0, indice)]);
  else if (destino.length) pos = e.tarefas.indexOf(destino[destino.length - 1]) + 1;
  else {
    const qualquer = e.tarefas.filter(x => x.quadrante === quadrante);
    pos = qualquer.length ? e.tarefas.indexOf(qualquer[qualquer.length - 1]) + 1 : e.tarefas.length;
  }
  e.tarefas.splice(pos, 0, t);
  return e;
}

export function concluir(estado, id, valor = true) {
  const e = copia(estado);
  e.tarefas[achar(e, id)].concluida = !!valor;
  return e;
}

export function remover(estado, id) {
  const e = copia(estado);
  e.tarefas.splice(achar(e, id), 1);
  return e;
}

export function limparConcluidas(estado) {
  return { versao: VERSAO, tarefas: estado.tarefas.filter(t => !t.concluida).map(t => ({ ...t })) };
}

/** Tarefas agrupadas por quadrante, na ordem. */
export function porQuadrante(estado, { mostrarConcluidas = true } = {}) {
  const g = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of estado.tarefas) if (mostrarConcluidas || !t.concluida) g[t.quadrante].push(t);
  return g;
}

export function contagem(estado) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, abertas: 0, concluidas: 0 };
  for (const t of estado.tarefas) { if (!t.concluida) { c[t.quadrante]++; c.abertas++; } else c.concluidas++; }
  return c;
}

export function serializar(estado) {
  return JSON.stringify({ app: 'quebec-eisenhower', versao: VERSAO, exportadoEm: new Date().toISOString(), tarefas: estado.tarefas }, null, 2);
}

/** Converte qualquer versão conhecida para a atual. Hoje só existe a 1. */
function migrar(obj) {
  if (obj.versao === 1) return obj;
  throw new RangeError(`Versão de arquivo não suportada: ${obj.versao}`);
}

/**
 * Lê um backup (texto JSON). Nunca lança: devolve { ok: true, estado } ou { ok: false, erro }.
 * Ids repetidos são renovados; campos desconhecidos são descartados.
 */
export function importar(texto) {
  let obj;
  try { obj = JSON.parse(texto); } catch { return { ok: false, erro: 'O arquivo não é um JSON válido.' }; }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tarefas)) return { ok: false, erro: 'O arquivo não é um backup da Matriz de Eisenhower.' };
  try { obj = migrar({ versao: obj.versao ?? 1, tarefas: obj.tarefas }); } catch (e) { return { ok: false, erro: e.message }; }
  if (obj.tarefas.length > LIMITE_TAREFAS) return { ok: false, erro: `O arquivo tem mais de ${LIMITE_TAREFAS} tarefas.` };
  const e = novoEstado();
  const ids = new Set();
  for (const [i, x] of obj.tarefas.entries()) {
    if (!x || typeof x !== 'object') return { ok: false, erro: `Tarefa ${i + 1}: formato inválido.` };
    let titulo, prazo;
    try { titulo = limparTitulo(x.titulo); prazo = limparPrazo(x.prazo); } catch (err) { return { ok: false, erro: `Tarefa ${i + 1}: ${err.message}` }; }
    const quadrante = Number(x.quadrante);
    if (!quadranteValido(quadrante)) return { ok: false, erro: `Tarefa ${i + 1}: quadrante inválido.` };
    let id = typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : null;
    if (!id || ids.has(id)) id = novoId(e);
    ids.add(id);
    e.tarefas.push({ id, titulo, nota: String(x.nota ?? '').slice(0, LIMITE_NOTA), quadrante, prazo, concluida: !!x.concluida, criadaEm: typeof x.criadaEm === 'string' ? x.criadaEm : new Date(0).toISOString() });
  }
  return { ok: true, estado: e };
}

/** Texto em Markdown para colar num e-mail ou nota. */
export function paraMarkdown(estado, { incluirConcluidas = false } = {}) {
  const g = porQuadrante(estado, { mostrarConcluidas: incluirConcluidas });
  const fmt = d => d ? ` (prazo ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)})` : '';
  return [1, 2, 3, 4].map(q => {
    const itens = g[q].map(t => `- [${t.concluida ? 'x' : ' '}] ${t.titulo}${fmt(t.prazo)}`);
    return `## ${QUADRANTES[q].nome} — ${QUADRANTES[q].dica.toLowerCase()}\n${itens.length ? itens.join('\n') : '_(vazio)_'}`;
  }).join('\n\n') + '\n';
}
