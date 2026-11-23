// Visualizador 3D — página fina: a interface é a do quebec (qb-drop, qb-kv, qb-status); o motor é o three.js (MIT).
// Motor carregado sob demanda: se o CDN falhar, a página avisa em vez de ficar muda.
let THREE, OrbitControls;
async function engine() {
  if (THREE) return;
  try { [THREE, { OrbitControls }] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]); }
  catch { throw Error('o motor 3D não carregou; verifique a conexão e tente de novo'); }
}

const $ = id => document.getElementById(id);
const el = { viewer: $('viewer'), bar: $('bar'), info: $('info'), wire: $('wire'), reset: $('reset'), status: $('status') };
const LOADERS = {
  stl: async () => new (await import('three/addons/loaders/STLLoader.js')).STLLoader(),
  obj: async () => new (await import('three/addons/loaders/OBJLoader.js')).OBJLoader(),
  ply: async () => new (await import('three/addons/loaders/PLYLoader.js')).PLYLoader(),
  glb: async () => new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader()
};
const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();

let renderer, scene, camera, controls, model, material, frameBox;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.viewer.append(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1e6);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 2, 3); camera.add(sun); scene.add(camera);
  material = new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new ResizeObserver(resize).observe(el.viewer);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
}

// Cores vêm dos tokens, então o modelo acompanha o tema claro/escuro.
function applyTheme() { if (material) material.color.set(css('--accent') || '#1D4673'); }

function resize() {
  const { clientWidth: w, clientHeight: h } = el.viewer;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

function frame() {
  const size = frameBox.getSize(new THREE.Vector3()), center = frameBox.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-6);
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(dist * 1.1));
  camera.near = dist / 100; camera.far = dist * 100; camera.updateProjectionMatrix();
  controls.target.copy(center); controls.update();
}

function toObject(result, ext) {
  if (ext === 'glb') return result.scene;
  if (result.isBufferGeometry) { result.computeVertexNormals(); return new THREE.Mesh(result, material); }
  result.traverse(o => { if (o.isMesh) o.material = material; });
  return result;
}

function describe(file, object) {
  let tris = 0;
  object.traverse(o => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  const s = frameBox.getSize(new THREE.Vector3());
  const rows = [['Arquivo', file.name], ['Triângulos', fmt.format(Math.round(tris))], ['Dimensões (X × Y × Z)', `${fmt.format(s.x)} × ${fmt.format(s.y)} × ${fmt.format(s.z)}`]];
  el.info.replaceChildren(...rows.flatMap(([k, v]) => [Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v })]));
}

async function open([file]) {
  const ext = file.name.split('.').pop().toLowerCase();
  drop.busy(true); QB.status(el.status, `Lendo ${file.name}…`);
  try {
    await engine();
    const loader = await LOADERS[ext]();
    const data = ext === 'obj' ? await file.text() : await file.arrayBuffer();
    const result = ext === 'glb' ? await loader.parseAsync(data, '') : loader.parse(data);
    if (!renderer) setup();
    if (model) scene.remove(model);
    model = toObject(result, ext); scene.add(model);
    frameBox = new THREE.Box3().setFromObject(model);
    if (frameBox.isEmpty()) throw Error('o arquivo não tem geometria');
    el.viewer.hidden = el.bar.hidden = false; document.getElementById('drop').classList.add('is-compact'); resize(); frame(); describe(file, model);
    QB.status(el.status, 'Modelo aberto. Arraste para girar; use a roda ou a pinça para aproximar.', 'ok');
  } catch (err) {
    QB.status(el.status, `Não foi possível abrir ${file.name}: ${err.message}`, 'error');
  } finally { drop.busy(false); }
}

const drop = QB.drop('drop', { onFiles: open, maxFiles: 1, maxBytes: 100 * 1024 * 1024, status: el.status });
el.reset.addEventListener('click', () => frameBox && frame());
el.wire.addEventListener('click', () => {
  const on = el.wire.getAttribute('aria-pressed') !== 'true';
  el.wire.setAttribute('aria-pressed', String(on));
  model?.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.wireframe = on; }); });
});
