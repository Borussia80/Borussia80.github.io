/* quebec — comportamento mínimo dos componentes (v1.1). Sem dependências. Carregar com defer, depois de bundle.css. */
(function () {
  'use strict';
  /* Tema: preferência salva (qb-theme = light | dark) ou a do sistema. */
  var KEY = 'qb-theme', root = document.documentElement, mq = window.matchMedia('(prefers-color-scheme: dark)');
  function savedTheme() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function applyTheme() {
    var s = savedTheme();
    root.setAttribute('data-theme', s === 'light' || s === 'dark' ? s : (mq.matches ? 'dark' : 'light'));
    var cur = s === 'light' || s === 'dark' ? s : 'system';
    document.querySelectorAll('[data-qb-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-qb-theme-set') === cur)); });
  }
  mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qb-theme-set]'); if (!b) return;
    var v = b.getAttribute('data-qb-theme-set');
    try { v === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch (err) {}
    applyTheme();
  });

  /* Menu no celular: botão .qb-menu-btn com aria-controls apontando para .qb-mobile-nav. */
  function setMenu(btn, open) {
    var panel = document.getElementById(btn.getAttribute('aria-controls')); if (!panel) return;
    btn.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
    if (open) { var first = panel.querySelector('a, button'); if (first) first.focus(); }
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.qb-menu-btn');
    if (btn) { setMenu(btn, btn.getAttribute('aria-expanded') !== 'true'); return; }
    document.querySelectorAll('.qb-menu-btn[aria-expanded="true"]').forEach(function (b) {
      var p = document.getElementById(b.getAttribute('aria-controls'));
      if (p && !p.contains(e.target)) setMenu(b, false);
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.qb-menu-btn[aria-expanded="true"]').forEach(function (b) { setMenu(b, false); b.focus(); });
  });

  /* Catálogo: [data-qb-catalog] com campo [data-qb-search], chips [data-qb-filter], itens [data-qb-item data-category data-search],
     estado vazio [data-qb-empty] (com [data-qb-query] e botão [data-qb-clear]) e contagem anunciada em [data-qb-status]. */
  function norm(t) { return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function initCatalog(cat) {
    var input = cat.querySelector('[data-qb-search]'), chips = cat.querySelectorAll('[data-qb-filter]'),
        items = cat.querySelectorAll('[data-qb-item]'), empty = cat.querySelector('[data-qb-empty]'),
        status = cat.querySelector('[data-qb-status]'), active = 'todas';
    function run() {
      var q = norm(input ? input.value.trim() : ''), n = 0;
      items.forEach(function (it) {
        var ok = (active === 'todas' || it.getAttribute('data-category') === active) &&
                 (!q || norm(it.getAttribute('data-search') || it.textContent).indexOf(q) > -1);
        it.hidden = !ok; if (ok) n++;
      });
      if (empty) { empty.hidden = n > 0; var qq = empty.querySelector('[data-qb-query]'); if (qq) qq.textContent = input ? input.value.trim() : ''; }
      if (status) status.textContent = n === 0 ? 'Nenhuma ferramenta encontrada' : n === 1 ? '1 ferramenta encontrada' : n + ' ferramentas encontradas';
    }
    function select(key) { active = key; chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-qb-filter') === key)); }); run(); }
    chips.forEach(function (c) { c.addEventListener('click', function () { select(c.getAttribute('data-qb-filter')); }); });
    if (input) input.addEventListener('input', run);
    cat.querySelectorAll('[data-qb-clear]').forEach(function (b) { b.addEventListener('click', function () { if (input) input.value = ''; select('todas'); if (input) input.focus(); }); });
    run();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    var s = document.querySelector('[data-qb-search]'); if (s) { e.preventDefault(); s.focus(); }
  });

  /* Área de arquivos: marca .is-over enquanto um arquivo é arrastado sobre .qb-drop. O processamento é da ferramenta. */
  document.addEventListener('dragenter', function (e) { var d = e.target.closest && e.target.closest('.qb-drop'); if (d) d.classList.add('is-over'); });
  document.addEventListener('dragleave', function (e) { var d = e.target.closest && e.target.closest('.qb-drop'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('is-over'); });
  document.addEventListener('drop', function (e) { var d = e.target.closest && e.target.closest('.qb-drop'); if (d) d.classList.remove('is-over'); });

  function ready() { applyTheme(); document.querySelectorAll('[data-qb-catalog]').forEach(initCatalog); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
})();
