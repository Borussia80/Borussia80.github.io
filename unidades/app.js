(() => {
  'use strict';
  // Fatores em unidades de base: metro, quilograma, metro quadrado e litro.
  const groups = {
    length: [
      ['m', 'metro (m)', 1], ['km', 'quilômetro (km)', 1000], ['cm', 'centímetro (cm)', 0.01],
      ['mm', 'milímetro (mm)', 0.001], ['mi', 'milha internacional (mi)', 1609.344],
      ['ft', 'pé internacional (ft)', 0.3048], ['in', 'polegada (in)', 0.0254]
    ],
    mass: [
      ['kg', 'quilograma (kg)', 1], ['g', 'grama (g)', 0.001], ['t', 'tonelada métrica (t)', 1000],
      ['lb', 'libra avoirdupois (lb)', 0.45359237], ['oz', 'onça avoirdupois (oz)', 0.45359237 / 16]
    ],
    temperature: [['C', 'grau Celsius (°C)', 1], ['F', 'grau Fahrenheit (°F)', 1], ['K', 'kelvin (K)', 1]],
    area: [
      ['m2', 'metro quadrado (m²)', 1], ['km2', 'quilômetro quadrado (km²)', 1e6],
      ['cm2', 'centímetro quadrado (cm²)', 1e-4], ['ha', 'hectare (ha)', 1e4],
      ['ft2', 'pé quadrado (ft²)', 0.3048 ** 2]
    ],
    volume: [
      ['L', 'litro (L)', 1], ['mL', 'mililitro (mL)', 0.001], ['m3', 'metro cúbico (m³)', 1000],
      ['gal', 'galão líquido dos EUA (gal)', 3.785411784]
    ]
  };
  const category = document.getElementById('category');
  const value = document.getElementById('value');
  const from = document.getElementById('from');
  const to = document.getElementById('to');
  const result = document.getElementById('result');
  const formula = document.getElementById('formula');
  const status = document.getElementById('status');
  const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 });
  const factorFmt = new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 10 });
  function parse(input) {
    const s = input.trim();
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }
  function options() {
    const units = groups[category.value];
    for (const select of [from, to]) {
      select.replaceChildren(...units.map(([key, label]) => new Option(label, key)));
    }
    to.selectedIndex = 1;
    convert();
  }
  function kelvin(v, unit) {
    if (unit === 'C') return v + 273.15;
    if (unit === 'F') return (v + 459.67) * 5 / 9;
    return v;
  }
  function fromKelvin(k, unit) {
    if (unit === 'C') return k - 273.15;
    if (unit === 'F') return k * 9 / 5 - 459.67;
    return k;
  }
  function display(n) {
    if (n !== 0 && Math.abs(n) < 1e-8) return n.toExponential(6).replace('.', ',');
    return fmt.format(Object.is(n, -0) ? 0 : n);
  }
  function convert() {
    const n = parse(value.value);
    const units = groups[category.value];
    const origin = units.find(([key]) => key === from.value);
    const target = units.find(([key]) => key === to.value);
    if (!Number.isFinite(n) || !origin || !target) {
      result.textContent = '—'; formula.textContent = '';
      status.textContent = 'Informe um número válido, sem separador de milhar.';
      status.classList.add('error'); value.setAttribute('aria-invalid', 'true'); return;
    }
    let converted;
    if (category.value === 'temperature') {
      const k = kelvin(n, origin[0]);
      if (k < -1e-10) {
        result.textContent = '—'; formula.textContent = '';
        status.textContent = 'A temperatura está abaixo do zero absoluto.';
        status.classList.add('error'); value.setAttribute('aria-invalid', 'true'); return;
      }
      converted = fromKelvin(Math.max(0, k), target[0]);
      formula.textContent = 'Via kelvin: K = °C + 273,15; K = (°F + 459,67) × 5/9.';
    } else {
      converted = n * origin[2] / target[2];
      formula.textContent = `1 ${origin[0]} = ${factorFmt.format(origin[2] / target[2])} ${target[0]}.`;
    }
    if (!Number.isFinite(converted)) { result.textContent = '—'; status.textContent = 'Valor fora do intervalo numérico disponível.'; status.classList.add('error'); return; }
    result.textContent = `${display(converted)} ${target[0] === 'C' ? '°C' : target[0] === 'F' ? '°F' : target[0]}`;
    status.textContent = 'Conversão realizada no navegador.';
    status.classList.remove('error'); value.setAttribute('aria-invalid', 'false');
  }
  category.addEventListener('change', options);
  [value, from, to].forEach(element => element.addEventListener(element === value ? 'input' : 'change', convert));
  document.getElementById('swap').addEventListener('click', () => {
    [from.value, to.value] = [to.value, from.value]; convert();
  });
  options();
})();
