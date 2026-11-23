/* quebec — comportamento mínimo dos componentes (v1.2). Sem dependências. Carregar com defer, depois de bundle.css.
   v1.2: ano do rodapé ([data-qb-year]) e a API window.QB (status, drop, copy) para as páginas de ferramenta. */
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

  /* ---------- API para páginas de ferramenta: window.QB ---------- */
  var QB = window.QB = window.QB || {};

  /* Mensagem em .qb-status (role="status"). kind: 'error' | 'ok' | omitido. */
  QB.status = function (el, message, kind) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', kind === 'error');
    el.classList.toggle('is-ok', kind === 'ok');
  };

  function fmtBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace('.', ',') + ' MB' : Math.ceil(n / 1024) + ' KB'; }
  function accepts(file, accept) {
    if (!accept) return true;
    var name = file.name.toLowerCase(), type = (file.type || '').toLowerCase();
    return accept.split(',').some(function (a) {
      a = a.trim().toLowerCase(); if (!a) return false;
      if (a.charAt(0) === '.') return name.slice(-a.length) === a;
      if (a.slice(-2) === '/*') return type.indexOf(a.slice(0, -1)) === 0;
      return type === a;
    });
  }

  /* Área de arquivos .qb-drop com <input type="file"> dentro.
     O input cobre a área toda, então clicar ou soltar arquivos usa o seletor nativo; aqui só validamos e entregamos.
     opts: { onFiles(files), maxBytes, maxFiles, status (elemento ou id de .qb-status) }. O filtro de tipo vem do atributo accept. */
  QB.drop = function (el, opts) {
    if (typeof el === 'string') el = document.getElementById(el);
    opts = opts || {};
    var input = el.querySelector('input[type="file"]'), accept = input.getAttribute('accept') || '';
    function take(list) {
      var ok = [], bad = [];
      Array.prototype.forEach.call(list, function (f) {
        if (!accepts(f, accept)) bad.push(f.name + ': tipo não aceito');
        else if (opts.maxBytes && f.size > opts.maxBytes) bad.push(f.name + ': maior que ' + fmtBytes(opts.maxBytes));
        else ok.push(f);
      });
      if (opts.maxFiles && ok.length > opts.maxFiles) { bad.push('Use até ' + opts.maxFiles + ' arquivo(s) por vez.'); ok = ok.slice(0, opts.maxFiles); }
      el.classList.toggle('is-error', bad.length > 0 && !ok.length);
      if (bad.length && opts.status) QB.status(opts.status, bad.join(' · '), 'error');
      if (ok.length && opts.onFiles) opts.onFiles(ok);
    }
    input.addEventListener('change', function () { take(input.files); input.value = ''; });
    return {
      input: input,
      open: function () { input.click(); },
      busy: function (on) { el.classList.toggle('is-busy', !!on); input.disabled = !!on; },
      take: take
    };
  };

  /* Botão de copiar: escreve no clipboard e mostra o estado confirmado (.is-done) por 2 s.
     O texto do botão fica num <span data-qb-label>; o ícone, se houver, é mantido. */
  QB.copy = function (btn, text, labels) {
    labels = labels || {};
    var label = btn.querySelector('[data-qb-label]') || btn, idle = label.getAttribute('data-idle') || label.textContent;
    label.setAttribute('data-idle', idle);
    function done(ok) {
      btn.classList.toggle('is-done', ok);
      label.textContent = ok ? (labels.done || 'Copiado') : (labels.fail || 'Não foi possível copiar');
      clearTimeout(btn._qbT); btn._qbT = setTimeout(function () { btn.classList.remove('is-done'); label.textContent = idle; }, 2000);
      return ok;
    }
    function legacy() {
      var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} t.remove(); return ok;
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return done(true); }, function () { return done(legacy()); });
    return Promise.resolve(done(legacy()));
  };

  function ready() {
    applyTheme();
    document.querySelectorAll('[data-qb-catalog]').forEach(initCatalog);
    var y = String(new Date().getFullYear());
    document.querySelectorAll('[data-qb-year]').forEach(function (el) { el.textContent = y; });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
})();
