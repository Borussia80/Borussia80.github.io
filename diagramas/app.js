// Editor de diagramas — página fina: interface quebec (qb-control, qb-chip, qb-btn, qb-status) e motor Mermaid (MIT).
const ENGINE = 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs';
let mermaid;

const $ = id => document.getElementById(id);
const el = { source: $('source'), preview: $('preview'), svg: $('svg'), png: $('png'), copy: $('copy'), status: $('status') };
const KEY = 'qb-diagramas';
const EXAMPLES = {
  fluxo: 'flowchart LR\n  FT[FT-101 vazão] --> FIC{FIC-101}\n  FIC -->|4-20 mA| FV[FV-101 válvula]\n  FV --> P[Processo]\n  P --> FT',
  sequencia: 'sequenceDiagram\n  participant Op as Operador\n  participant SDCD\n  participant V as Válvula\n  Op->>SDCD: Ajusta setpoint\n  SDCD->>V: Sinal 4-20 mA\n  V-->>SDCD: Posição (HART)\n  SDCD-->>Op: Tendência atualizada',
  estado: 'stateDiagram-v2\n  [*] --> Parada\n  Parada --> Partida: comando local\n  Partida --> Operando: permissivos OK\n  Operando --> Trip: intertravamento\n  Trip --> Parada: rearme'
};
let current = '', seq = 0, timer;

// O tema do diagrama segue o tema da página; as cores saem dos tokens.
function init() {
  const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: css('--font-sans'),
    themeVariables: { primaryColor: css('--surface'), primaryBorderColor: css('--accent'), primaryTextColor: css('--text'), lineColor: css('--text-muted'),
      secondaryColor: css('--accent-tint'), tertiaryColor: css('--surface-sunken'), background: css('--surface-sunken'), fontSize: '15px' } });
}

async function render() {
  if (!mermaid) return;
  const code = el.source.value, id = `d${++seq}`;
  try { localStorage.setItem(KEY, code); } catch {}
  if (!code.trim()) { el.preview.replaceChildren(); current = ''; el.svg.disabled = el.png.disabled = true; QB.status(el.status, 'Escreva um diagrama para ver a prévia.'); return; }
  try {
    await mermaid.parse(code);
    const { svg } = await mermaid.render(id, code);
    if (id !== `d${seq}`) return; // uma digitação mais nova já pediu outra prévia
    el.preview.innerHTML = svg; current = svg;
    el.svg.disabled = el.png.disabled = false; el.source.setAttribute('aria-invalid', 'false');
    QB.status(el.status, 'Prévia atualizada.');
  } catch (err) {
    document.getElementById(id)?.remove(); document.getElementById(`d${id}`)?.remove();
    el.source.setAttribute('aria-invalid', 'true');
    QB.status(el.status, `Erro de sintaxe: ${String(err.message || err).split('\n')[0]}`, 'error');
  }
}
const later = () => { clearTimeout(timer); timer = setTimeout(render, 300); };

function save(blob, name) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function png() {
  const svgEl = el.preview.querySelector('svg'); const box = svgEl.getBoundingClientRect(), scale = 2;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(current);
  await img.decode();
  const c = Object.assign(document.createElement('canvas'), { width: Math.ceil(box.width * scale), height: Math.ceil(box.height * scale) });
  const ctx = c.getContext('2d'); ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#fff';
  ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  c.toBlob(b => save(b, 'diagrama.png'), 'image/png');
}

document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-example]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  el.source.value = EXAMPLES[b.dataset.example]; render();
}));
el.source.addEventListener('input', later);
el.svg.addEventListener('click', () => save(new Blob([current], { type: 'image/svg+xml' }), 'diagrama.svg'));
el.png.addEventListener('click', () => png().catch(() => QB.status(el.status, 'Não foi possível gerar o PNG neste navegador.', 'error')));
el.copy.addEventListener('click', () => QB.copy(el.copy, el.source.value));
new MutationObserver(() => { init(); render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

let saved = null; try { saved = localStorage.getItem(KEY); } catch {}
el.source.value = saved || EXAMPLES.fluxo;
if (saved && saved !== EXAMPLES.fluxo) document.querySelector('[data-example="fluxo"]').setAttribute('aria-pressed', 'false');
try {
  QB.status(el.status, 'Carregando o motor de diagramas…');
  ({ default: mermaid } = await import(ENGINE));
  init(); render();
} catch {
  QB.status(el.status, 'Não foi possível carregar o motor de diagramas. Verifique a conexão e recarregue a página.', 'error');
}
