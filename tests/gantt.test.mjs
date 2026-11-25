// Testes do núcleo do Mini-Gantt (gantt/parser.js e gantt/agenda.js).
// Uso: node tests/gantt.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerLista, escreverLista, chave } from '../gantt/parser.js';
import { agendar, ordenar, paraFrappe } from '../gantt/agenda.js';
import * as D from '../lib/dias-uteis.js';

const dados = JSON.parse(readFileSync(new URL('../dias-uteis/feriados-br.json', import.meta.url), 'utf8'));
const BA = D.criarCalendario(dados, { uf: 'BA' });
const porNome = r => Object.fromEntries(r.tarefas.map(t => [t.nome, t]));

// ---- Leitura ----
{
  const { tarefas, erros } = lerLista(`Tarefa; Início; Duração; Dependências
# comentário
Projeto básico; 19/11/2026; 10du
Compra de instrumentos; ; 15d; Projeto basico

Montagem\t\t5\tCompra de instrumentos, Projeto básico
Comissionamento; ; 0; Montagem`);
  assert.deepEqual(erros, []);
  assert.equal(tarefas.length, 4);
  assert.deepEqual(tarefas.map(t => [t.nome, t.inicio, t.duracao, t.unidade, t.deps.length]), [
    ['Projeto básico', '2026-11-19', 10, 'du', 0], ['Compra de instrumentos', null, 15, 'd', 1],
    ['Montagem', null, 5, 'du', 2], ['Comissionamento', null, 0, 'du', 1]]);
  assert.equal(tarefas[0].linha, 3, 'número da linha no texto');
  assert.equal(chave('  Projeto   BÁSICO '), 'projeto basico');
  // Ida e volta pelo texto
  const de2 = lerLista(escreverLista(tarefas));
  assert.deepEqual(de2.erros, []);
  assert.deepEqual(de2.tarefas.map(({ linha, ...t }) => t), tarefas.map(({ linha, ...t }) => t), 'escrever → ler devolve o mesmo');
}
{
  const { erros } = lerLista(`A; 31/02/2026; 5
B; ; dez
C; 01/12/2026
H; 01/12/2026; 2
; 01/12/2026; 2
D; 01/12/2026; 2; X
E; 01/12/2026; 2; E
F; 01/12/2026; 9999
G; 01/12/2026; 2; ; sobra
H; 02/12/2026; 1`);
  assert.deepEqual(erros.map(e => [e.linha, e.msg.split(':')[0].split(' (')[0]]), [
    [1, 'data de início inválida'], [2, 'duração inválida'], [3, 'falta a duração'],
    [5, 'falta o nome da tarefa'], [6, 'dependência não encontrada'], [7, 'a tarefa depende dela mesma'],
    [8, 'duração acima de 3650 dias'], [9, 'colunas demais'], [10, 'tarefa repetida']]);
}

// ---- Agendamento: casos conhecidos (BA) ----
{
  const { tarefas } = lerLista(`Projeto básico; 19/11/2026; 10du
Compra; ; 15d; Projeto básico
Montagem; ; 5du; Compra, Projeto básico
Documentação; ; 3du; Projeto básico
Comissionamento; ; 0; Montagem, Documentação`);
  const r = agendar(tarefas, BA);
  assert.equal(r.ok, true, r.erro);
  const t = porNome(r);
  assert.equal(t['Projeto básico'].fim, '2026-12-03', '10du a partir de 19/11/2026 pula o 20/11 (Consciência Negra)');
  assert.equal(t['Compra'].inicio, '2026-12-04', 'corridos começam no dia seguinte ao fim da dependência');
  assert.equal(t['Compra'].fim, '2026-12-18', '15 dias corridos');
  assert.equal(t['Montagem'].inicio, '2026-12-21', 'próximo dia útil depois da Compra');
  assert.equal(t['Montagem'].fim, '2026-12-28', '5du: 21, 22, 23, 24 e 28 (25/12 é feriado; 26 e 27 fim de semana)');
  assert.equal(t['Documentação'].inicio, '2026-12-04');
  assert.equal(t['Documentação'].fim, '2026-12-08');
  assert.equal(t['Comissionamento'].inicio, '2026-12-29'); assert.equal(t['Comissionamento'].marco, true);
  assert.deepEqual(r.tarefas.filter(x => x.critico).map(x => x.nome), ['Compra', 'Montagem', 'Comissionamento'], 'caminho crítico');
  // A Compra (15 dias corridos) pode deslizar um dia e terminar no domingo 20/12 sem atrasar a Montagem (segunda 21/12);
  // por isso o Projeto básico tem 1 dia útil de folga: pode terminar na sexta 04/12.
  assert.equal(t['Projeto básico'].folga, 1); assert.equal(t['Projeto básico'].fimTarde, '2026-12-04');
  assert.equal(t['Compra'].fimTarde, '2026-12-20');
  assert.ok(t['Documentação'].folga > 0, 'Documentação tem folga');
  assert.equal(t['Documentação'].fimTarde, '2026-12-28', 'só o Comissionamento depende dela: pode terminar até 28/12');
  assert.deepEqual(r.projeto, { inicio: '2026-11-19', fim: '2026-12-29', diasUteis: 27, diasCorridos: 41 }, 'nov: 7 dias úteis a partir de 19/11; dez até 29/12: 20');
  // Cruzado com a calculadora (A1): toda tarefa em du tem exatamente N dias úteis
  for (const x of r.tarefas) if (x.unidade === 'du' && x.duracao) assert.equal(D.contarDiasUteis(x.inicio, x.fim, BA, { incluirInicio: true }), x.duracao, x.nome);
  // Formato do frappe-gantt
  const f = paraFrappe(r.tarefas);
  assert.equal(f[0].end, '2026-12-04', 'fim exclusivo no frappe');
  assert.match(f.find(x => x.name === 'Montagem').dependencies, /^t\d, t\d$/);
  assert.match(f.find(x => x.name === 'Montagem').custom_class, /is-critico/);
}
{ // Data própria mais tarde que a dependência prevalece; início em fim de semana vai para o dia útil
  const { tarefas } = lerLista(`A; 21/11/2026; 1du
B; 10/12/2026; 2du; A
C; 05/12/2026; 2d; A`);
  const t = porNome(agendar(tarefas, BA));
  assert.equal(t.A.inicio, '2026-11-23', 'sábado 21/11 → segunda 23/11');
  assert.equal(t.B.inicio, '2026-12-10');
  assert.equal(t.C.inicio, '2026-12-05', 'corridos começam no sábado se a data pedir');
  assert.equal(t.C.fim, '2026-12-06');
}
{ // Erros
  const ciclo = lerLista(`A; 01/12/2026; 1; C
B; ; 1; A
C; ; 1; B`);
  const r = agendar(ciclo.tarefas, BA);
  assert.equal(r.ok, false);
  assert.match(r.erro, /^Dependência circular: (A → B → C → A|B → C → A → B|C → A → B → C)$/);
  assert.equal(r.ids.length, 3);
  const sem = lerLista('A; ; 3du');
  assert.match(agendar(sem.tarefas, BA).erro, /não tem data de início/);
  assert.equal(agendar(sem.tarefas, BA, { inicioProjeto: '2026-12-01' }).tarefas[0].fim, '2026-12-03');
  assert.match(agendar(lerLista('A; 20/12/2035; 30du').tarefas, BA).erro, /2020 a 2035/);
  assert.deepEqual(agendar([], BA), { ok: true, tarefas: [], projeto: null });
}

// ---- Propriedades: grafos aleatórios sem ciclo ----
let semente = 42;
const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
let grafos = 0, tarefasTestadas = 0;
for (const uf of ['BA', 'SP', 'PE', 'RS', 'AM']) {
  const cal = D.criarCalendario(dados, { uf, cinzasNaoUtil: rnd() < 0.5 });
  for (let g = 0; g < 200; g++) {
    const n = 2 + Math.floor(rnd() * 25);
    const linhas = [];
    for (let i = 0; i < n; i++) {
      const deps = [];
      for (let j = 0; j < i; j++) if (rnd() < 0.15) deps.push(`T${j}`);
      const temData = !deps.length || rnd() < 0.2;
      const data = temData ? D.formatarData(D.deDia(D.paraDia('2026-01-05') + Math.floor(rnd() * 3000))) : '';
      const dur = rnd() < 0.1 ? '0' : `${1 + Math.floor(rnd() * 40)}${rnd() < 0.25 ? 'd' : 'du'}`;
      linhas.push(`T${i}; ${data}; ${dur}; ${deps.join(', ')}`);
    }
    const lido = lerLista(linhas.join('\n'));
    assert.deepEqual(lido.erros, []);
    const r = agendar(lido.tarefas, cal);
    assert.equal(r.ok, true, r.erro);
    const id = new Map(r.tarefas.map(t => [t.id, t]));
    for (const t of r.tarefas) {
      assert.ok(t.fim >= t.inicio, 'fim depois do início');
      if (t.unidade === 'du' || t.marco) { assert.ok(D.ehDiaUtil(t.inicio, cal), `início útil ${t.nome}`); assert.ok(D.ehDiaUtil(t.fim, cal), `fim útil ${t.nome}`); }
      if (t.unidade === 'du' && !t.marco) assert.equal(t.diasUteis, t.duracao, `N dias úteis ${t.nome}`);
      if (t.unidade === 'd' && !t.marco) assert.equal(t.diasCorridos, t.duracao, `N dias corridos ${t.nome}`);
      for (const d of t.deps) assert.ok(t.inicio > id.get(d).fim, `${t.nome} começa depois de ${id.get(d).nome}`);
      if (t.inicio !== undefined && lido.tarefas.find(x => x.id === t.id).inicio) {
        const pedido = lido.tarefas.find(x => x.id === t.id).inicio;
        assert.ok(t.inicio >= pedido, 'não começa antes da data pedida');
      }
      assert.ok(t.folga >= 0);
      assert.ok(t.fimTarde >= t.fim, `fim mais tarde ≥ mais cedo (${t.nome})`);
      tarefasTestadas++;
    }
    assert.ok(r.tarefas.some(t => t.critico), 'existe caminho crítico');
    assert.ok(r.tarefas.some(t => t.fim === r.projeto.fim && t.critico), 'a tarefa que termina o projeto é crítica');
    grafos++;
  }
}

// ---- Carga: 500 tarefas em cadeia ----
const cadeia = Array.from({ length: 500 }, (_, i) => `Etapa ${i}; ${i ? '' : '05/01/2026'}; 3du; ${i ? `Etapa ${i - 1}` : ''}`).join('\n');
const t0 = performance.now();
const rc = agendar(lerLista(cadeia).tarefas, BA);
const ms = performance.now() - t0;
assert.equal(rc.ok, true, rc.erro);
assert.ok(ms < 1000, `500 tarefas em ${ms.toFixed(0)} ms`);
assert.equal(ordenar(lerLista(cadeia).tarefas).ordem.length, 500);

console.log(`Mini-Gantt (núcleo): leitura, erros por linha, agendamento, caminho crítico, cruzado com dias úteis, ${grafos} grafos aleatórios (${tarefasTestadas.toLocaleString('pt-BR')} tarefas) e cadeia de 500 (${ms.toFixed(0)} ms): OK`);
