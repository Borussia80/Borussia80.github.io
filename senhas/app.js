(() => {
  'use strict';
  const form = document.getElementById('password-form');
  const length = document.getElementById('length');
  const output = document.getElementById('password');
  const reveal = document.getElementById('reveal');
  const copy = document.getElementById('copy');
  const status = document.getElementById('status');
  const sets = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%&*+-=?_'
  };
  const cryptoSource = globalThis.crypto;
  function randomIndex(max) {
    const range = 0x100000000;
    const limit = range - range % max;
    const sample = new Uint32Array(1);
    do { cryptoSource.getRandomValues(sample); } while (sample[0] >= limit);
    return sample[0] % max;
  }
  function choose(chars) { return chars[randomIndex(chars.length)]; }
  function shuffle(chars) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
  function message(value, error = false) {
    status.textContent = value;
    status.classList.toggle('error', error);
  }
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
    form.querySelector('button[type=submit]').disabled = true;
    message('Este navegador não oferece geração criptográfica de números aleatórios.', true);
    return;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const size = Number(length.value);
    const selected = Object.entries(sets).filter(([name]) => form.elements[name].checked).map(([, chars]) => chars);
    if (!Number.isInteger(size) || size < 8 || size > 64) { message('Escolha de 8 a 64 caracteres.', true); return; }
    if (!selected.length) { message('Marque ao menos um tipo de caractere.', true); return; }
    const pool = selected.join('');
    const chars = selected.map(choose);
    while (chars.length < size) chars.push(choose(pool));
    output.value = shuffle(chars);
    output.type = 'password';
    reveal.textContent = 'Mostrar';
    reveal.setAttribute('aria-pressed', 'false');
    reveal.disabled = copy.disabled = false;
    message('Senha gerada neste dispositivo.');
  });
  reveal.addEventListener('click', () => {
    const visible = output.type === 'password';
    output.type = visible ? 'text' : 'password';
    reveal.textContent = visible ? 'Ocultar' : 'Mostrar';
    reveal.setAttribute('aria-pressed', String(visible));
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      message('Senha copiada.');
    } catch {
      message('Não foi possível copiar automaticamente. Selecione a senha e copie pelo navegador.', true);
      output.type = 'text'; output.focus(); output.select();
    }
  });
})();
