// Matriz de Eisenhower — interface. Regras e dados em ./modelo.js (testado em tests/eisenhower.test.mjs).
import * as M from './modelo.js?v=1';

const CHAVE = 'qb.eisenhower.v1';
const CHAVE_VER = 'qb.eisenhower.verConcluidas';
const ICONES = '/assets/quebec/icons.svg?v=1.2.1';
const $ = id => document.getElementById(id);
const el = { matriz: $('matriz'), resumo: $('resumo'), status: $('status'), ver: $('ver-concluidas'), copiar: $('copiar-md'),
  exportar: $('exportar'), importar: $('importar'), limpar: $('limpar'),
  confirmar: $('confirmar'), cTitulo: $('confirmar-titulo'), cTexto: $('confirmar-texto'), cSim: $('confirmar-sim'), cNao: $('confirmar-nao') };

let estado = M.novoEstado();
let armazenamento = true;
let editando = null;
let Sortable = null;
const listas = {};

function status(msg, tipo) { if (window.QB?.status) window.QB.status(el.status, msg, tipo); else el.status.textContent = msg; }
function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return;
    const r = M.importar(bruto);
    if (r.ok) estado = r.estado;
    else status('Os dados salvos neste navegador estão corrompidos e não foram carregados. Importe um backup.', 'error');
    el.ver.checked = localStorage.getItem(CHAVE_VER) !== '0';
  } catch {
    armazenamento = false;
    status('Este navegador não permite salvar dados locais (modo privado?). A matriz funciona, mas some ao fechar a página. Use "Exportar backup".', 'error');
  }
}
function salvar() {
  if (!armazenamento) return;
  try { localStorage.setItem(CHAVE, M.serializar(estado)); localStorage.setItem(CHAVE_VER, el.ver.checked ? '1' : '0'); }
  catch { status('Não foi possível salvar (armazenamento cheio ou bloqueado). Exporte um backup.', 'error'); }
}
const visivel = t => el.ver.checked || !t.concluida;

/** Aplica uma operação do modelo, salva e redesenha, devolvendo o foco para `foco` (id de tarefa ou seletor). */
function aplicar(fn, foco) {
  try { estado = fn(estado); }
  catch (e) { status(e.message, 'error'); return false; }
  salvar(); render(foco); return true;
}

// ---------- Desenho ----------
function svg(nome) { return `<svg class="qb-i" aria-hidden="true"><use href="${ICONES}#${nome}"/></svg>`; }
function dataCurta(iso) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function montarQuadrantes() {
  for (const q of [1, 2, 3, 4]) {
    const sec = document.createElement('section');
    sec.className = `eis-q eis-q--${q}`; sec.dataset.q = q;
    sec.setAttribute('aria-labelledby', `q${q}-t`);
    sec.innerHTML = `<header class="eis-q-head"><span class="eis-q-num" aria-hidden="true">${q}</span><div><h2 class="h3" id="q${q}-t">${M.QUADRANTES[q].nome}</h2><p class="qb-help">${M.QUADRANTES[q].dica}</p></div><span class="eis-q-cont" id="q${q}-c"></span></header>
      <ul class="eis-lista" id="q${q}-l" data-q="${q}" aria-labelledby="q${q}-t"></ul>
      <form class="eis-add" data-q="${q}"><label class="qb-visually-hidden" for="q${q}-i">Nova tarefa em ${M.QUADRANTES[q].nome}</label><input class="qb-control" id="q${q}-i" maxlength="${M.LIMITE_TITULO}" placeholder="Nova tarefa" autocomplete="off"><button class="qb-btn qb-btn--secondary" type="submit">Adicionar</button></form>`;
    el.matriz.append(sec);
    listas[q] = sec.querySelector('.eis-lista');
  }
}

function item(t) {
  const li = document.createElement('li');
  li.className = 'eis-item' + (t.concluida ? ' is-done' : '');
  li.dataset.id = t.id;
  if (editando === t.id) {
    li.classList.add('is-editing');
    li.innerHTML = `<form class="eis-edit"><label class="qb-label" for="e-${t.id}-t">Título</label><input class="qb-control" id="e-${t.id}-t" maxlength="${M.LIMITE_TITULO}">
      <label class="qb-label" for="e-${t.id}-p">Prazo (opcional)</label><input class="qb-control" type="date" id="e-${t.id}-p">
      <div class="qb-actions"><button class="qb-btn qb-btn--primary qb-btn--sm" type="submit">Salvar</button><button class="qb-btn qb-btn--ghost qb-btn--sm" type="button" data-acao="cancelar">Cancelar</button></div></form>`;
    li.querySelector('input').value = t.titulo;
    li.querySelector('input[type=date]').value = t.prazo ?? '';
    return li;
  }
  li.tabIndex = 0;
  li.setAttribute('aria-label', `${t.titulo}${t.concluida ? ', concluída' : ''}${t.prazo ? `, prazo ${dataCurta(t.prazo)}` : ''}`);
  const atrasada = t.prazo && !t.concluida && t.prazo < hojeISO();
  const opcoes = [1, 2, 3, 4].map(q => `<option value="${q}"${q === t.quadrante ? ' selected' : ''}>${M.QUADRANTES[q].nome}</option>`).join('');
  li.innerHTML = `<span class="eis-arrastar" aria-hidden="true" title="Arrastar"></span>
    <input type="checkbox" class="eis-ok"${t.concluida ? ' checked' : ''} tabindex="-1">
    <span class="eis-texto"><span class="eis-titulo"></span>${t.prazo ? `<span class="eis-prazo${atrasada ? ' is-late' : ''}">${atrasada ? 'atrasada · ' : 'até '}${dataCurta(t.prazo)}</span>` : ''}</span>
    <span class="qb-select eis-mover"><select class="qb-control" tabindex="-1">${opcoes}</select></span>
    <button class="qb-icon-btn" type="button" data-acao="editar" tabindex="-1">${svg('text')}</button>
    <button class="qb-icon-btn" type="button" data-acao="apagar" tabindex="-1">${svg('close')}</button>`;
  li.querySelector('.eis-titulo').textContent = t.titulo;
  li.querySelector('.eis-ok').setAttribute('aria-label', `Concluir: ${t.titulo}`);
  li.querySelector('select').setAttribute('aria-label', `Mover "${t.titulo}" para`);
  li.querySelector('[data-acao=editar]').setAttribute('aria-label', `Editar: ${t.titulo}`);
  li.querySelector('[data-acao=apagar]').setAttribute('aria-label', `Apagar: ${t.titulo}`);
  return li;
}

function render(foco) {
  const g = M.porQuadrante(estado, { mostrarConcluidas: el.ver.checked });
  const c = M.contagem(estado);
  for (const q of [1, 2, 3, 4]) {
    listas[q].replaceChildren(...g[q].map(item));
    if (!g[q].length) { const v = document.createElement('li'); v.className = 'eis-vazio'; v.textContent = 'Solte uma tarefa aqui ou adicione abaixo.'; listas[q].append(v); }
    $(`q${q}-c`).textContent = String(c[q]);
  }
  el.resumo.textContent = `${c.abertas} ${c.abertas === 1 ? 'aberta' : 'abertas'} · ${c.concluidas} ${c.concluidas === 1 ? 'concluída' : 'concluídas'}`;
  el.limpar.disabled = !c.concluidas;
  if (typeof foco === 'string') {
    const alvo = foco.startsWith('#') || foco.startsWith('.') ? document.querySelector(foco) : el.matriz.querySelector(`.eis-item[data-id="${foco}"]`);
    if (alvo) { alvo.focus(); if (alvo.matches('.is-editing')) alvo.querySelector('input').select(); }
  }
}

// ---------- Ações ----------
function idDe(alvo) { return alvo.closest('.eis-item')?.dataset.id; }
function indiceVisivel(id) { const t = estado.tarefas.find(x => x.id === id); return M.porQuadrante(estado, { mostrarConcluidas: el.ver.checked })[t.quadrante].findIndex(x => x.id === id); }

function ligarEventos() {
  el.matriz.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (f.matches('.eis-add')) {
      const inp = f.querySelector('input'); const q = +f.dataset.q;
      if (!inp.value.trim()) { inp.focus(); return; }
      if (aplicar(s => M.criar(s, { titulo: inp.value, quadrante: q }), `#q${q}-i`)) status(`Tarefa adicionada em ${M.QUADRANTES[q].nome}.`, 'ok');
      document.querySelector(`#q${q}-i`).value = '';
    } else if (f.matches('.eis-edit')) {
      const id = idDe(f); const [t, p] = f.querySelectorAll('input');
      editando = null;
      if (!aplicar(s => M.editar(s, id, { titulo: t.value, prazo: p.value || null }), id)) { editando = id; render(id); }
    }
  });
  el.matriz.addEventListener('change', e => {
    const id = idDe(e.target); if (!id) return;
    if (e.target.matches('.eis-ok')) aplicar(s => M.concluir(s, id, e.target.checked), id);
    else if (e.target.matches('.eis-mover select')) { const q = +e.target.value; aplicar(s => M.mover(s, id, q, Infinity, visivel), id); status(`Movida para ${M.QUADRANTES[q].nome}.`, 'ok'); }
  });
  el.matriz.addEventListener('click', e => {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const id = idDe(b);
    if (b.dataset.acao === 'editar') { editando = id; render(id); }
    else if (b.dataset.acao === 'cancelar') { editando = null; render(id); }
    else if (b.dataset.acao === 'apagar') apagar(id);
  });
  el.matriz.addEventListener('keydown', e => {
    if (e.target.closest('.is-editing')) { if (e.key === 'Escape') { const id = idDe(e.target); editando = null; render(id); } return; }
    const li = e.target.closest('.eis-item'); if (!li || e.target !== li) return;
    const id = li.dataset.id; const t = estado.tarefas.find(x => x.id === id);
    if (/^[1-4]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); const q = +e.key; aplicar(s => M.mover(s, id, q, Infinity, visivel), id); status(`Movida para ${M.QUADRANTES[q].nome}.`, 'ok'); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const i = indiceVisivel(id) + (e.key === 'ArrowUp' ? -1 : 1); if (i >= 0) aplicar(s => M.mover(s, id, t.quadrante, i, visivel), id); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); (e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling)?.focus?.(); }
    else if (e.key === ' ') { e.preventDefault(); aplicar(s => M.concluir(s, id, !t.concluida), id); }
    else if (e.key === 'Enter') { e.preventDefault(); editando = id; render(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); apagar(id); }
  });
  el.ver.addEventListener('change', () => { salvar(); render(); });
  el.copiar.addEventListener('click', () => window.QB?.copy(el.copiar, M.paraMarkdown(estado, { incluirConcluidas: el.ver.checked })));
  el.exportar.addEventListener('click', exportar);
  el.importar.addEventListener('change', importarArquivo);
  el.limpar.addEventListener('click', () => {
    const n = M.contagem(estado).concluidas;
    perguntar(`Apagar ${n} ${n === 1 ? 'tarefa concluída' : 'tarefas concluídas'}?`, 'Não dá para desfazer, a não ser que você tenha um backup.', () => { aplicar(M.limparConcluidas, '#ver-concluidas'); status('Concluídas apagadas.', 'ok'); });
  });
  el.cNao.addEventListener('click', () => fecharPergunta());
}

let ultimaApagada = null;
function apagar(id) {
  const lista = [...el.matriz.querySelectorAll('.eis-item')];
  const i = lista.findIndex(x => x.dataset.id === id);
  const prox = lista[i + 1]?.dataset.id ?? lista[i - 1]?.dataset.id;
  ultimaApagada = estado.tarefas.find(t => t.id === id)?.titulo;
  aplicar(s => M.remover(s, id), prox ?? '#q1-i');
  status(`Apagada: ${ultimaApagada}.`, 'ok');
}

let acaoPendente = null;
function perguntar(titulo, texto, acao) {
  el.cTitulo.textContent = titulo; el.cTexto.textContent = texto; acaoPendente = acao;
  el.confirmar.hidden = false; el.cSim.focus();
  el.cSim.onclick = () => { const a = acaoPendente; fecharPergunta(); a?.(); };
}
function fecharPergunta() { el.confirmar.hidden = true; acaoPendente = null; }

function exportar() {
  const d = new Date();
  const nome = `eisenhower-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const url = URL.createObjectURL(new Blob([M.serializar(estado)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(`Backup exportado: ${nome}.`, 'ok');
}
async function importarArquivo() {
  const f = el.importar.files[0]; el.importar.value = '';
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { status('Arquivo grande demais para um backup (máximo 2 MB).', 'error'); return; }
  const r = M.importar(await f.text());
  if (!r.ok) { status(`Backup não importado: ${r.erro}`, 'error'); return; }
  const atual = estado.tarefas.length, novo = r.estado.tarefas.length;
  perguntar(`Substituir ${atual} ${atual === 1 ? 'tarefa' : 'tarefas'} por ${novo} do arquivo?`, `Arquivo: ${f.name}. As tarefas atuais serão trocadas pelas do backup.`, () => {
    estado = r.estado; editando = null; salvar(); render(); status(`Backup importado: ${novo} ${novo === 1 ? 'tarefa' : 'tarefas'}.`, 'ok');
  });
}

// ---------- Arrastar (SortableJS) ----------
// O quadrante inteiro aceita o cartão: soltar no espaço vazio de um quadrante (fora da lista) leva para o fim dele.
let ponteiro = null;
const guardarPonteiro = e => {
  const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e; ponteiro = [t.clientX, t.clientY];
  const q = quadranteSobPonteiro(); if (q) marcarDestino(listas[q]);
};
function quadranteSobPonteiro() {
  if (!ponteiro) return null;
  const sob = document.elementsFromPoint(ponteiro[0], ponteiro[1]).find(x => !x.closest('.is-drag') && x.closest('.eis-q'));
  return sob ? +sob.closest('.eis-q').dataset.q : null;
}
function marcarDestino(lista) {
  el.matriz.querySelectorAll('.eis-q.is-target').forEach(q => q.classList.remove('is-target'));
  lista?.closest('.eis-q')?.classList.add('is-target');
}
async function ligarArrastar() {
  try { ({ default: Sortable } = await import('sortablejs')); }
  catch { status('O arrastar e soltar não carregou (sem conexão?). Use o menu "Mover para" ou as teclas 1 a 4.', 'error'); return; }
  for (const q of [1, 2, 3, 4]) {
    Sortable.create(listas[q], {
      group: 'eisenhower', animation: 160, easing: 'cubic-bezier(.2, 0, 0, 1)',
      // Mouse: arrasta o cartão inteiro depois de 4 px. Toque: pressão de 180 ms, para a rolagem da página continuar livre.
      forceFallback: true, fallbackTolerance: 4, fallbackOnBody: true, delay: 180, delayOnTouchOnly: true, touchStartThreshold: 6,
      draggable: '.eis-item:not(.is-editing)', filter: 'input, select, button, .eis-vazio', preventOnFilter: false,
      ghostClass: 'is-ghost', chosenClass: 'is-chosen', dragClass: 'is-drag', fallbackClass: 'is-drag',
      scroll: true, bubbleScroll: true, scrollSensitivity: 80, scrollSpeed: 14,
      onStart: () => {
        el.matriz.classList.add('is-dragging'); navigator.vibrate?.(10);
        for (const t of ['mousemove', 'touchmove', 'pointermove']) document.addEventListener(t, guardarPonteiro, { passive: true });
      },
      onMove: ev => { marcarDestino(ev.to); },
      onEnd: ev => {
        el.matriz.classList.remove('is-dragging'); marcarDestino(null);
        for (const t of ['mousemove', 'touchmove', 'pointermove']) document.removeEventListener(t, guardarPonteiro);
        const id = ev.item.dataset.id; let destino = +ev.to.dataset.q;
        let indice = [...ev.to.querySelectorAll('.eis-item')].indexOf(ev.item);
        const sob = quadranteSobPonteiro();
        if (sob && sob !== destino) { destino = sob; indice = Infinity; }
        ponteiro = null;
        // O SortableJS descarta o próximo clique depois de soltar. Se o botão foi solto fora do cartão, esse clique
        // nunca vem e o primeiro clique real do usuário (ex.: "Salvar") seria engolido. Um clique sintético limpa a marca.
        setTimeout(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), 0);
        aplicar(s => M.mover(s, id, destino, indice, visivel), id);
        status(`Movida para ${M.QUADRANTES[destino].nome}.`, 'ok');
      }
    });
  }
}

// ---------- Início ----------
montarQuadrantes();
ler();
ligarEventos();
render();
ligarArrastar().finally(() => { document.documentElement.dataset.eisPronto = '1'; });
