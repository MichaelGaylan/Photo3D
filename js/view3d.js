// Rotatable 3D preview (P3D-005). three.js loads from jsDelivr the first time it is opened.
// Drag to turn, pinch or scroll to zoom, double-tap to reset. Everything is freed on close,
// because iPhone Safari has a tight memory limit per page.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';

let THREE = null;
let v = null; // { renderer, scene, camera, mesh, el, ... }

function fillZ(geo, hm, w, h, sx, sy, baseMm, reliefMm) {
  const pos = geo.attributes.position;
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
    const x = Math.min(w - 1, Math.round(i * (w - 1) / (sx - 1))), y = Math.min(h - 1, Math.round(j * (h - 1) / (sy - 1)));
    pos.setZ(j * sx + i, baseMm + hm[y * w + x] * reliefMm);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// hm is a heightmap (0..1) already sized for the view (longest side about maxSeg).
export async function open3D(el, hm, w, h, widthMm, reliefMm, baseMm, maxSeg) {
  if (!THREE) THREE = await import(THREE_URL);
  const keep = v && v.el === el ? { rx: v.st.rx, ry: v.st.ry, dist: v.st.dist } : null;
  close3D();
  const heightMm = widthMm * h / w;
  const s = Math.min(1, maxSeg / Math.max(w, h));
  const sx = Math.max(2, Math.round(w * s)), sy = Math.max(2, Math.round(h * s));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  el.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);

  const geo = new THREE.PlaneGeometry(widthMm, heightMm, sx - 1, sy - 1);
  fillZ(geo, hm, w, h, sx, sy, baseMm, reliefMm);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9b98f, roughness: 0.75, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.6, 0.8, 1).multiplyScalar(widthMm * 2); scene.add(sun);

  const size = Math.max(widthMm, heightMm);
  const st = { rx: -0.55, ry: 0, dist: size * 1.9, home: { rx: -0.55, ry: 0, dist: size * 1.9 } };
  if (keep) Object.assign(st, keep);
  v = { renderer, scene, camera, mesh, geo, mat, el, st, size, ro: null, handlers: [], w, h, sx, sy, widthMm, maxSeg };

  const render = () => {
    if (!v) return;
    const r = el.getBoundingClientRect();
    const W = Math.max(50, r.width), H = Math.max(50, r.height || r.width * 0.75);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    mesh.rotation.set(st.rx, st.ry, 0);
    camera.position.set(0, 0, st.dist); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  v.render = render;

  // Pointer controls: one finger/mouse turns, two fingers pinch zoom.
  const pts = new Map(); let pinch0 = 0, dist0 = 0;
  const on = (t, f, o) => { renderer.domElement.addEventListener(t, f, o); v.handlers.push([t, f]); };
  renderer.domElement.style.touchAction = 'none';
  on('pointerdown', (e) => { renderer.domElement.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = st.dist; } });
  on('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { st.ry += dx * 0.01; st.rx = Math.max(-1.5, Math.min(0.6, st.rx + dy * 0.01)); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) st.dist = Math.max(size * 0.4, Math.min(size * 6, dist0 * pinch0 / d)); }
    render();
  });
  const up = (e) => { pts.delete(e.pointerId); pinch0 = 0; };
  on('pointerup', up); on('pointercancel', up);
  on('wheel', (e) => { e.preventDefault(); st.dist = Math.max(size * 0.4, Math.min(size * 6, st.dist * Math.exp(e.deltaY * 0.001))); render(); }, { passive: false });
  on('dblclick', () => { Object.assign(st, st.home); render(); });

  v.ro = new ResizeObserver(render); v.ro.observe(el);
  render();
}

// New slider values: move the existing surface instead of rebuilding everything.
export async function update3D(hm, w, h, widthMm, reliefMm, baseMm) {
  if (!v) return;
  if (v.w !== w || v.h !== h || v.widthMm !== widthMm) return open3D(v.el, hm, w, h, widthMm, reliefMm, baseMm, v.maxSeg);
  fillZ(v.geo, hm, w, h, v.sx, v.sy, baseMm, reliefMm);
  v.render();
}

export function is3DOpen() { return !!v; }

export function close3D() {
  if (!v) return;
  const { renderer, geo, mat, ro, handlers } = v;
  ro && ro.disconnect();
  for (const [t, f] of handlers) renderer.domElement.removeEventListener(t, f);
  geo.dispose(); mat.dispose();
  renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
  renderer.domElement.remove();
  v = null;
}
