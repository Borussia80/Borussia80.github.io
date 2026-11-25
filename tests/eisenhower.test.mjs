// Testes do modelo da Matriz de Eisenhower (eisenhower/modelo.js).
// Uso: node tests/eisenhower.test.mjs
import assert from 'node:assert/strict';
import * as M from '../eisenhower/modelo.js';

const AGORA = '2026-11-25T12:00:00.000Z';
const titulos = (e, q) => M.porQuadrante(e)[q].map(t => t.titulo);
let e = M.novoEstado();
const original = e;

// ---- Criar, editar, mover, concluir, remover ----
e = M.criar(e, { titulo: '  Relatório   mensal ', quadrante: 1 }, { agora: AGORA, id: 'a' });
e = M.criar(e, { titulo: 'Planejar 2027', quadrante: 2, prazo: '2026-12-15' }, { agora: AGORA, id: 'b' });
e = M.criar(e, { titulo: 'Responder fornecedor', quadrante: 1 }, { agora: AGORA, id: 'c' });
e = M.criar(e, { titulo: 'Rede social', quadrante: 4 }, { agora: AGORA, id: 'd' });
assert.equal(original.tarefas.length, 0, 'estado original intacto');
assert.deepEqual(titulos(e, 1), ['Relatório mensal', 'Responder fornecedor'], 'espaços normalizados e ordem de criação');
assert.equal(M.porQuadrante(e)[2][0].prazo, '2026-12-15');
assert.throws(() => M.criar(e, { titulo: '   ' }), /título/);
assert.throws(() => M.criar(e, { titulo: 'x', quadrante: 5 }), /Quadrante/);
assert.throws(() => M.criar(e, { titulo: 'x', prazo: '15/12/2026' }), /Prazo/);
assert.ok(M.criar(e, { titulo: 'x'.repeat(500) }).tarefas.some(t => t.titulo === 'x'.repeat(M.LIMITE_TITULO)), 'título truncado');

e = M.mover(e, 'c', 1, 0);
assert.deepEqual(titulos(e, 1), ['Responder fornecedor', 'Relatório mensal'], 'reordenar dentro do quadrante');
e = M.mover(e, 'a', 3);
assert.deepEqual(titulos(e, 3), ['Relatório mensal'], 'mover para quadrante vazio');
e = M.mover(e, 'd', 2, 0);
assert.deepEqual(titulos(e, 2), ['Rede social', 'Planejar 2027'], 'mover para o topo de outro quadrante');
assert.throws(() => M.mover(e, 'zz', 1), /inexistente/);

e = M.concluir(e, 'b');
assert.equal(M.contagem(e).concluidas, 1);
assert.deepEqual(M.porQuadrante(e, { mostrarConcluidas: false })[2].map(t => t.id), ['d']);
// Mover com índice relativo só às visíveis: com 'b' (concluída, oculta) no fim do Q2, índice 1 entra depois de 'd'
e = M.criar(e, { titulo: 'Nova', quadrante: 4 }, { id: 'n' });
e = M.mover(e, 'n', 2, 1, t => !t.concluida);
assert.deepEqual(M.porQuadrante(e)[2].map(t => t.id), ['d', 'n', 'b']);
e = M.editar(e, 'n', { titulo: 'Nova tarefa', prazo: '' });
assert.equal(M.porQuadrante(e)[2][1].titulo, 'Nova tarefa');
assert.equal(M.porQuadrante(e)[2][1].prazo, null);
e = M.remover(e, 'n');
e = M.limparConcluidas(e);
assert.equal(e.tarefas.some(t => t.id === 'b'), false, 'limpar concluídas');
assert.deepEqual(M.contagem(e), { 1: 1, 2: 1, 3: 1, 4: 0, abertas: 3, concluidas: 0 });

// ---- Exportar e importar ----
const ida = M.serializar(e);
const volta = M.importar(ida);
assert.equal(volta.ok, true);
assert.deepEqual(volta.estado, e, 'export → import devolve o mesmo estado');
assert.equal(M.importar('não é json').ok, false);
assert.match(M.importar('{"x":1}').erro, /não é um backup/);
assert.match(M.importar('{"versao":9,"tarefas":[]}').erro, /Versão/);
assert.match(M.importar('{"versao":1,"tarefas":[{"titulo":"a","quadrante":7}]}').erro, /Tarefa 1: quadrante/);
assert.match(M.importar('{"versao":1,"tarefas":[{"titulo":"","quadrante":1}]}').erro, /Tarefa 1: .*título/);
const dup = M.importar(JSON.stringify({ versao: 1, tarefas: [{ id: 'x', titulo: 'a', quadrante: 1 }, { id: 'x', titulo: 'b', quadrante: '2', extra: 'lixo', concluida: 1 }] }));
assert.equal(dup.ok, true);
assert.notEqual(dup.estado.tarefas[0].id, dup.estado.tarefas[1].id, 'ids repetidos renovados');
assert.equal(dup.estado.tarefas[1].quadrante, 2); assert.equal(dup.estado.tarefas[1].concluida, true);
assert.equal('extra' in dup.estado.tarefas[1], false, 'campos desconhecidos descartados');
const md = M.paraMarkdown(e);
assert.match(md, /^## Fazer agora — urgente e importante\n- \[ \] Responder fornecedor\n/);
assert.match(md, /## Eliminar — nem urgente nem importante\n_\(vazio\)_/);

// ---- Propriedade: 5 mil operações aleatórias, nada some nem duplica ----
let semente = 7;
const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
let s = M.novoEstado();
const vivos = new Set();
for (let i = 0; i < 5000; i++) {
  const op = rnd();
  const ids = s.tarefas.map(t => t.id);
  if (op < 0.35 || !ids.length) {
    s = M.criar(s, { titulo: `t${i}`, quadrante: 1 + Math.floor(rnd() * 4) }, { id: `i${i}` }); vivos.add(`i${i}`);
  } else if (op < 0.7) {
    s = M.mover(s, pick(ids), 1 + Math.floor(rnd() * 4), Math.floor(rnd() * 8), rnd() < 0.5 ? t => !t.concluida : null);
  } else if (op < 0.85) {
    s = M.concluir(s, pick(ids), rnd() < 0.7);
  } else if (op < 0.97) {
    const id = pick(ids); s = M.remover(s, id); vivos.delete(id);
  } else {
    for (const t of s.tarefas) if (t.concluida) vivos.delete(t.id);
    s = M.limparConcluidas(s);
  }
  const atuais = s.tarefas.map(t => t.id);
  assert.equal(new Set(atuais).size, atuais.length, `sem duplicadas (op ${i})`);
  assert.deepEqual(new Set(atuais), vivos, `nenhuma tarefa some (op ${i})`);
  if (i % 500 === 0) assert.deepEqual(M.importar(M.serializar(s)).estado, s, `export/import (op ${i})`);
}

// ---- Carga: 500 tarefas ----
let grande = M.novoEstado();
const t0 = performance.now();
for (let i = 0; i < 500; i++) grande = M.criar(grande, { titulo: `Tarefa ${i}`, quadrante: 1 + (i % 4) });
for (let i = 0; i < 200; i++) grande = M.mover(grande, grande.tarefas[i].id, 1 + ((i + 1) % 4), 0);
const ms = performance.now() - t0;
assert.equal(grande.tarefas.length, 500);
assert.ok(ms < 1000, `500 criações + 200 movimentos em ${ms.toFixed(0)} ms`);

console.log(`Eisenhower: operações, validação, export/import, 5.000 operações aleatórias e carga de 500 tarefas (${ms.toFixed(0)} ms): OK`);
