import { APP_NAME, VERSION, BUILD, WHATS_NEW, W3F_KEY, REPORT_SUBJECT } from './config.js';
import { estimateDepth, depthDevice, avoidDevices, IS_IOS } from './depth.js';
import { makeHeightmap, baseDepth, renderPreview, luminance, DEFAULTS } from './relief.js';
import { png16, png8, stl, download } from './export.js';
import { applyTheme, themeGrid } from './theme.js';
import { cleanupPhoto } from './cleanup.js';
import { open3D, update3D, close3D, is3DOpen } from './view3d.js';
import { PROFILES, savedProfile, saveProfile, testCard } from './profiles.js';

applyTheme();

const $ = (id) => document.getElementById(id);
const MAX_PHOTO = IS_IOS ? 1600 : 2048; // longest side kept from the photo (iPhone: less memory)
const PREVIEW = IS_IOS ? 480 : 720; // longest side of the live preview (iPhone: less memory)
const MAX_STL = 600;      // longest side of the STL grid (keeps files under ~45 MB)
const MAX_3D = IS_IOS ? 160 : 256; // longest side of the rotatable 3D mesh (iPhone: less memory)

const state = { photo: null, undo: null, depth: null, view: 'photo', opts: { ...DEFAULTS }, name: 'relief' };

// ---------- Crash guard ----------
// If the browser closes the page during AI depth (iPhone memory limit), the
// next load finds the attempt still marked, skips that engine, and restores the photo.
const ATTEMPT = 'p3d.aiAttempt', AVOID = 'p3d.aiAvoid';
const avoidList = JSON.parse(localStorage.getItem(AVOID) || '[]');
let crashedOn = localStorage.getItem(ATTEMPT);
// 'loading' = closed before an engine was picked (while the runtime started).
if (crashedOn === 'loading') crashedOn = IS_IOS || avoidList.includes('webgpu') ? 'wasm' : 'webgpu';
if (crashedOn) {
  localStorage.removeItem(ATTEMPT);
  if (!avoidList.includes(crashedOn)) avoidList.push(crashedOn);
  localStorage.setItem(AVOID, JSON.stringify(avoidList));
}
avoidDevices(avoidList);

// Last photo kept on the device (IndexedDB) so a page reload doesn't lose it.
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('photo3d', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function kv(key, value) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', value === undefined ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
    const r = value === undefined ? st.get(key) : st.put(value, key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}

// ---------- Workspace: dock the controls left, right or bottom (P3D-010) ----------
const DOCK = 'p3d.dock';
// Slides a segmented control's glass bubble under its selected button.
function bubble(seg) {
  const on = seg.querySelector('button.on'), b = seg.querySelector('.bubble');
  if (!b) return;
  if (!on || !on.offsetWidth) { b.style.width = '0'; return; }
  b.style.left = on.offsetLeft + 'px'; b.style.width = on.offsetWidth + 'px';
}
const segs = [$('viewSeg'), $('dockSeg')];
const segRO = new ResizeObserver(() => segs.forEach(bubble)); segs.forEach((s) => segRO.observe(s));
function setDock(d) {
  if (!['left', 'right', 'bottom'].includes(d)) d = 'bottom';
  localStorage.setItem(DOCK, d);
  document.body.classList.remove('dock-left', 'dock-right', 'dock-bottom');
  document.body.classList.add('dock-' + d);
  document.querySelectorAll('[data-dock]').forEach((x) => x.classList.toggle('on', x.dataset.dock === d));
  bubble($('dockSeg'));
  requestAnimationFrame(() => { bubble($('viewSeg')); if (cropping) layoutCrop(); });
}
document.querySelectorAll('[data-dock]').forEach((b) => b.addEventListener('click', () => setDock(b.dataset.dock)));
setDock(localStorage.getItem(DOCK) || (matchMedia('(min-width: 1100px)').matches ? 'right' : 'bottom'));

// ---------- 1. Photo ----------
for (const inp of [$('camIn'), $('fileIn')]) inp.addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  e.target.value = '';
  await loadPhoto(f, (f.name || 'relief').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_') || 'relief', true);
});

function savePhoto() {
  kv('session', null).catch(() => {});
  const name = state.name;
  state.photo.toBlob((b) => kv('photo', { blob: b, name }).catch(() => {}), 'image/jpeg', 0.92);
}

async function loadPhoto(f, name, save) {
  state.name = name;
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
  const s = Math.min(1, MAX_PHOTO / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  if (cropping) endCrop();
  freeCanvas(state.undo); state.undo = null; $('undoPhoto').hidden = true;
  state.photo = c;
  photoChanged();
  setStatus('Photo ready: ' + c.width + ' × ' + c.height + ' px.');
  if (save) savePhoto();
}

function freeCanvas(c) { if (c) c.width = c.height = 0; } // hands the pixels back right away (iPhone)

// A new or edited photo: the old depth no longer fits it.
function photoChanged() {
  state.depth = null; cache.clear();
  $('stage').hidden = false; $('photoTools').hidden = false; $('stepDepth').hidden = false;
  $('stepAdjust').hidden = true; $('stepExport').hidden = true;
  for (const b of $('viewSeg').querySelectorAll('button')) b.disabled = b.dataset.view !== 'photo';
  setView('photo');
  $('stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Replace the photo with an edited copy (cleanup or crop). One step of Undo.
function editPhoto(c) {
  freeCanvas(state.undo);
  state.undo = state.photo; state.photo = c; $('undoPhoto').hidden = false;
  photoChanged(); savePhoto();
}
$('undoPhoto').addEventListener('click', () => {
  if (!state.undo) return;
  if (cropping) endCrop();
  freeCanvas(state.photo); state.photo = state.undo; state.undo = null; $('undoPhoto').hidden = true;
  photoChanged(); savePhoto(); setStatus('Back to the photo before the last change.');
});

// Clean up (P3D-009): dust and specks, uneven light, flat levels.
$('cleanBtn').addEventListener('click', () => {
  if (!state.photo) return;
  if (cropping) endCrop();
  $('cleanBtn').disabled = true; setStatus('Cleaning up the photo…');
  setTimeout(() => {
    try {
      const t0 = performance.now();
      editPhoto(cleanupPhoto(state.photo, +$('cleanStrength').value));
      setStatus('Photo cleaned up in ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s. Tap Undo to go back.');
    } catch (err) { console.error(err); setStatus('Could not clean up this photo (' + (err && err.message || err) + ').'); }
    finally { $('cleanBtn').disabled = false; }
  }, 30);
});

// Crop (P3D-006): drag a box over the photo, then Apply.
let cropping = false, crop = null, drag = null;
$('cropBtn').addEventListener('click', () => {
  if (!state.photo) return;
  if (cropping) { endCrop(); return; }
  setView('photo');
  cropping = true; crop = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  $('cropBox').hidden = false; $('cropBar').hidden = false; $('cropBtn').classList.add('primary');
  layoutCrop();
});
function endCrop() {
  cropping = false; drag = null;
  $('cropBox').hidden = true; $('cropBar').hidden = true; $('cropBtn').classList.remove('primary');
}
// Fit the crop layer to the picture inside the canvas (the canvas can be letterboxed).
function layoutCrop() {
  const cv = $('preview'), cr = cv.getBoundingClientRect(), br = $('stageBox').getBoundingClientRect();
  if (!cv.width || !cr.width) return;
  const sc = Math.min(cr.width / cv.width, cr.height / cv.height), cw = cv.width * sc, ch = cv.height * sc;
  Object.assign($('cropBox').style, { left: (cr.left - br.left + (cr.width - cw) / 2) + 'px', top: (cr.top - br.top + (cr.height - ch) / 2) + 'px', width: cw + 'px', height: ch + 'px', right: 'auto', bottom: 'auto' });
  Object.assign($('cropRect').style, { left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.w * 100 + '%', height: crop.h * 100 + '%' });
}
const cropPoint = (e) => {
  const r = $('cropBox').getBoundingClientRect();
  return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
};
$('cropBox').addEventListener('pointerdown', (e) => {
  e.preventDefault(); $('cropBox').setPointerCapture(e.pointerId);
  const [px, py] = cropPoint(e), h = e.target.dataset && e.target.dataset.h;
  if (h) drag = { mode: h };
  else if (e.target === $('cropRect')) drag = { mode: 'move', px, py, x: crop.x, y: crop.y };
  else { crop = { x: px, y: py, w: 0, h: 0 }; drag = { mode: 'se' }; }
  drag.ax = drag.mode.includes('w') ? crop.x + crop.w : crop.x; // the fixed corner while resizing
  drag.ay = drag.mode.includes('n') ? crop.y + crop.h : crop.y;
});
$('cropBox').addEventListener('pointermove', (e) => {
  if (!drag) return;
  const [px, py] = cropPoint(e);
  if (drag.mode === 'move') {
    crop.x = Math.min(1 - crop.w, Math.max(0, drag.x + px - drag.px));
    crop.y = Math.min(1 - crop.h, Math.max(0, drag.y + py - drag.py));
  } else {
    crop = { x: Math.min(drag.ax, px), y: Math.min(drag.ay, py), w: Math.abs(px - drag.ax), h: Math.abs(py - drag.ay) };
  }
  layoutCrop();
});
const cropUp = () => {
  if (!drag) return; drag = null;
  if (crop.w < 0.03 || crop.h < 0.03) crop = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }; // a tap, not a drag
  layoutCrop();
};
$('cropBox').addEventListener('pointerup', cropUp); $('cropBox').addEventListener('pointercancel', cropUp);
$('cropCancel').addEventListener('click', endCrop);
$('cropApply').addEventListener('click', () => {
  const p = state.photo;
  const sx = Math.round(crop.x * p.width), sy = Math.round(crop.y * p.height);
  const sw = Math.max(8, Math.round(crop.w * p.width)), sh = Math.max(8, Math.round(crop.h * p.height));
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(p, sx, sy, sw, sh, 0, 0, sw, sh);
  endCrop(); editPhoto(c);
  setStatus('Cropped to ' + sw + ' × ' + sh + ' px. Tap Undo to go back.');
});
window.addEventListener('resize', () => { if (cropping) layoutCrop(); });

// Pick up where you left off if the page reloaded within 30 minutes of making a relief.
function depthReady() {
  for (const b of $('viewSeg').querySelectorAll('button')) b.disabled = false;
  $('stepAdjust').hidden = false; $('stepExport').hidden = false;
  setView(state.view === 'photo' ? 'shaded' : state.view); updateSize();
}
if (!crashedOn) {
  Promise.all([kv('photo'), kv('session')]).then(async ([saved, sess]) => {
    if (!saved || !saved.blob || !sess || !sess.depth || Date.now() - sess.t > 30 * 60 * 1000) return;
    await loadPhoto(saved.blob, saved.name, false);
    state.depth = sess.depth;
    setStatus('Picked up where you left off.');
    depthReady();
  }).catch(() => {});
}

if (crashedOn) {
  kv('photo').then(async (saved) => {
    if (saved && saved.blob) await loadPhoto(saved.blob, saved.name, false);
    setStatus(crashedOn === 'webgpu'
      ? 'AI depth closed the page last time. Your photo is back. Tap Make relief to try the lighter AI mode.'
      : 'AI depth needs more memory than this browser allows, so Quick is selected. Your photo is back.');
    if (crashedOn !== 'webgpu') { document.querySelector('input[value=quick]').checked = true; modeChanged(); }
    $('tiled').checked = false;
  }).catch(() => {});
}

// ---------- 2. Depth ----------
function setStatus(text, frac) {
  $('status').innerHTML = '';
  $('status').append(text);
  if (frac != null) { const b = document.createElement('div'); b.className = 'bar'; b.innerHTML = '<i></i>'; b.firstChild.style.width = Math.round(frac * 100) + '%'; $('status').append(b); }
}

function modeChanged() { $('tiledPick').hidden = document.querySelector('input[name=mode]:checked').value !== 'ai'; }
for (const r of document.querySelectorAll('input[name=mode]')) r.addEventListener('change', modeChanged);
modeChanged();

const files = {};
function onProgress(p) {
  if (p.status === 'device') { localStorage.setItem(ATTEMPT, p.device); return; }
  if (p.status === 'running') {
    if (p.n > 1) setStatus('Working out the depth, part ' + (p.i + 1) + ' of ' + p.n + '…', p.i / p.n);
    else setStatus('Working out the depth… this can take 10 to 20 seconds on a phone.');
    return;
  }
  if (p.status === 'progress' && p.total) {
    files[p.file] = [p.loaded, p.total];
    const v = Object.values(files), l = v.reduce((a, x) => a + x[0], 0), t = v.reduce((a, x) => a + x[1], 0);
    setStatus('Downloading the depth model (first time only): ' + (l / 1e6).toFixed(0) + ' of ' + (t / 1e6).toFixed(0) + ' MB', l / t);
  }
}

$('runBtn').addEventListener('click', async () => {
  if (!state.photo) return;
  if (cropping) endCrop();
  const mode = document.querySelector('input[name=mode]:checked').value, tiled = mode === 'ai' && $('tiled').checked;
  $('runBtn').disabled = true;
  const t0 = performance.now();
  try {
    if (mode === 'ai') localStorage.setItem(ATTEMPT, 'loading');
    setStatus(mode === 'ai' ? 'Loading the depth model…' : 'Working…');
    state.depth = null; cache.clear();
    state.depth = await estimateDepth(state.photo, mode, onProgress, tiled);
    kv('session', { depth: state.depth, t: Date.now() }).catch(() => {});
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus((mode === 'ai' ? 'AI depth' + (tiled ? ' with extra detail' : '') + ' done on ' + (depthDevice() === 'webgpu' ? 'GPU' : 'CPU') : 'Quick depth done') + ' in ' + secs + ' s.');
    depthReady();
    $('stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error(err);
    setStatus('Could not make AI depth on this device (' + (err && err.message || err) + '). Try Quick, or check your connection for the first download.');
  } finally { localStorage.removeItem(ATTEMPT); $('runBtn').disabled = false; }
});

// ---------- 3. Adjust and view ----------
const SLIDERS = ['detail', 'texture', 'smooth', 'gamma', 'background'];
for (const k of SLIDERS) {
  $(k).value = state.opts[k];
  $(k).addEventListener('input', () => { state.opts[k] = +$(k).value; schedule(); });
}
$('invert').addEventListener('change', () => { state.opts.invert = $('invert').checked; schedule(); });
for (const b of $('viewSeg').querySelectorAll('button')) b.addEventListener('click', () => { if (!b.disabled) setView(b.dataset.view); });

function setView(v) {
  state.view = v;
  $('viewSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.view === v));
  bubble($('viewSeg'));
  const r3 = v === 'rotate';
  if (r3 && cropping) endCrop();
  $('preview').hidden = r3; $('view3d').hidden = !r3; $('viewHint').hidden = !r3;
  if (!r3) close3D();
  redraw();
}

// Redraw at most every 80 ms and never two at once, so dragging a slider
// doesn't pile up big temporary arrays (iPhone Safari closes the page when memory runs out).
let timer = 0, busy = false, dirty = false;
function schedule() {
  if (busy) { dirty = true; return; }
  clearTimeout(timer);
  timer = setTimeout(async () => { busy = true; try { await redraw(); } finally { busy = false; } if (dirty) { dirty = false; schedule(); } }, 80);
}

// Inputs that sliders don't change, per size (preview and 3D): computed once per photo and depth.
const cache = new Map();
function inputsFor(w, h) {
  const key = w + 'x' + h;
  let c = cache.get(key);
  if (!c) {
    if (cache.size >= 2) cache.clear();
    c = { lum: lumAt(w, h).lum, base: baseDepth(state.depth, w, h), img: null };
    cache.set(key, c);
  }
  return c;
}

function lumAt(w, h) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  g.drawImage(state.photo, 0, 0, w, h);
  return { lum: luminance(g.getImageData(0, 0, w, h)), canvas: c };
}

function sizeFor(longest) {
  const p = state.photo, s = longest / Math.max(p.width, p.height);
  return [Math.max(2, Math.round(p.width * s)), Math.max(2, Math.round(p.height * s))];
}

const mmInputs = () => [+$('widthMm').value || 100, +$('reliefMm').value || 3, +$('baseMm').value || 0];

async function redraw() {
  if (!state.photo) return;
  if (state.view === 'rotate') return draw3D();
  const [w, h] = sizeFor(Math.min(PREVIEW, Math.max(state.photo.width, state.photo.height)));
  const cv = $('preview'); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  if (state.view === 'photo' || !state.depth) { g.drawImage(state.photo, 0, 0, w, h); if (cropping) layoutCrop(); return; }
  const pi = inputsFor(w, h);
  if (!pi.img) pi.img = new ImageData(w, h);
  const hm = makeHeightmap(state.depth, pi.lum, w, h, state.opts, pi.base);
  const [widthMm, reliefMm] = mmInputs();
  g.putImageData(renderPreview(hm, w, h, state.view === 'shaded' ? 'shaded' : 'height', reliefMm, widthMm / w, pi.img), 0, 0);
}

// Rotatable 3D preview (P3D-005): a small mesh, freed when you leave this view.
async function draw3D() {
  if (!state.depth) return;
  const [w, h] = sizeFor(MAX_3D), pi = inputsFor(w, h);
  const hm = makeHeightmap(state.depth, pi.lum, w, h, state.opts, pi.base);
  const [widthMm, reliefMm, baseMm] = mmInputs();
  try {
    if (is3DOpen()) await update3D(hm, w, h, widthMm, reliefMm, baseMm);
    else await open3D($('view3d'), hm, w, h, widthMm, reliefMm, baseMm, MAX_3D);
    if (state.view !== 'rotate') close3D(); // switched away while three.js was loading
  } catch (err) {
    console.error(err);
    $('viewHint').textContent = 'The 3D viewer could not start (' + (err && err.message || err) + '). It needs a connection the first time.';
  }
}

// ---------- 4. Size, machine and export ----------
function exportSize(kind) {
  const p = state.photo, widthMm = +$('widthMm').value || 100, ppm = +$('pxPerMm').value || 10;
  let w = Math.round(widthMm * ppm), h = Math.round(w * p.height / p.width);
  if (kind === 'stl') { const s = Math.min(1, MAX_STL / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s); }
  return [Math.max(2, w), Math.max(2, h)];
}
function updateSize() {
  if (!state.photo) return;
  const widthMm = +$('widthMm').value || 100, [w, h] = exportSize('png');
  $('sizeInfo').textContent = 'Finished size ' + widthMm + ' × ' + (widthMm * h / w).toFixed(1) + ' mm, heightmap ' + w + ' × ' + h + ' px.';
}
for (const id of ['widthMm', 'reliefMm', 'baseMm', 'pxPerMm']) $(id).addEventListener('input', () => { updateSize(); schedule(); });

// Machine and material profiles (P3D-007): starting values and the export that suits.
for (const [k, p] of Object.entries(PROFILES)) $('profile').add(new Option(p.label, k));
function applyProfile(k, setValues) {
  const p = PROFILES[k] || PROFILES.custom;
  $('profile').value = PROFILES[k] ? k : 'custom';
  if (setValues && p.widthMm) {
    $('widthMm').value = p.widthMm; $('reliefMm').value = p.reliefMm; $('baseMm').value = p.baseMm; $('pxPerMm').value = p.pxPerMm;
    $('invert').checked = state.opts.invert = !!p.invert;
  }
  const best = p.export || 'png16';
  document.querySelectorAll('[data-export]').forEach((b) => b.classList.toggle('primary', b.dataset.export === best));
  $('profileTip').hidden = !p.tip; $('profileTip').textContent = p.tip || '';
}
$('profile').addEventListener('change', () => { saveProfile($('profile').value); applyProfile($('profile').value, true); updateSize(); schedule(); });
applyProfile(savedProfile(), true);
const bestExport = () => (PROFILES[$('profile').value] || {}).export || 'png16';

for (const b of document.querySelectorAll('[data-export]')) b.addEventListener('click', async () => {
  if (!state.depth) return;
  const kind = b.dataset.export; b.disabled = true;
  try {
    const [w, h] = exportSize(kind);
    const { lum } = lumAt(w, h);
    const hm = makeHeightmap(state.depth, lum, w, h, state.opts);
    const [widthMm, reliefMm, baseMm] = mmInputs();
    const tag = state.name + '_' + widthMm + 'mm';
    if (kind === 'png16') download(await png16(hm, w, h, w / widthMm), tag + '_16bit.png');
    if (kind === 'png8') download(await png8(hm, w, h), tag + '_8bit.png');
    if (kind === 'stl') download(stl(hm, w, h, widthMm, reliefMm, baseMm), tag + '.stl');
  } catch (err) { console.error(err); alertStatus('Export failed: ' + (err && err.message || err)); }
  finally { b.disabled = false; }
});
function alertStatus(t) { $('sizeInfo').textContent = t; }

// Calibration test card in the selected size and export.
$('testCardBtn').addEventListener('click', async () => {
  const kind = bestExport(), [widthMm, reliefMm, baseMm] = mmInputs();
  let ppm = +$('pxPerMm').value || 10;
  if (kind === 'stl') ppm = Math.min(ppm, MAX_STL / widthMm);
  $('testCardBtn').disabled = true;
  try {
    const { hm, w, h } = testCard(widthMm, ppm);
    if ($('invert').checked) for (let i = 0; i < hm.length; i++) hm[i] = 1 - hm[i];
    const tag = 'Photo3D_test_card_' + widthMm + 'mm';
    if (kind === 'png16') download(await png16(hm, w, h, w / widthMm), tag + '_16bit.png');
    if (kind === 'png8') download(await png8(hm, w, h), tag + '_8bit.png');
    if (kind === 'stl') download(stl(hm, w, h, widthMm, reliefMm, baseMm), tag + '.stl');
  } catch (err) { console.error(err); alertStatus('Test card failed: ' + (err && err.message || err)); }
  finally { $('testCardBtn').disabled = false; }
});

// ---------- Menu, What's new, Report a problem ----------
$('ver').textContent = APP_NAME + ' ' + VERSION + ' · build ' + BUILD;
$('whatsNew').innerHTML = WHATS_NEW.map(([v, t]) => '<li><b>' + v + '</b> ' + t.replace(/</g, '&lt;') + '</li>').join('');
$('aboutVer').textContent = 'Version ' + VERSION + ', build ' + BUILD + '.';
$('themes').append(themeGrid());
$('menuBtn').addEventListener('click', () => { $('menu').showModal(); bubble($('dockSeg')); });
$('closeMenu').addEventListener('click', () => $('menu').close());
if (!W3F_KEY) $('sendReport').hidden = true;

function reportBody() {
  return $('reportText').value.trim() + '\n\n— ' + APP_NAME + ' ' + VERSION + ' (' + BUILD + ')\n' + navigator.userAgent + '\nDepth: ' + (depthDevice() || 'not run');
}
$('copyReport').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(reportBody()); $('reportStatus').textContent = 'Copied.'; } catch { $('reportStatus').textContent = 'Could not copy.'; }
});
$('sendReport').addEventListener('click', async () => {
  $('reportStatus').textContent = 'Sending…';
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: W3F_KEY, subject: REPORT_SUBJECT, from_name: APP_NAME, botcheck: '', message: reportBody() }),
    });
    const j = await res.json();
    if (!(j && j.success)) throw 0;
    $('reportStatus').textContent = 'Sent. Thank you.'; $('reportText').value = '';
  } catch {
    try { await navigator.clipboard.writeText(reportBody()); } catch {}
    $('reportStatus').textContent = 'Could not send. The report text is copied so you can paste it in an email.';
  }
});

// ---------- Offline and updates ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // The update bar stays until Update now or Later is tapped. After Later,
    // the menu (☰) keeps an "Install the update" button.
    const show = (w) => {
      const go = () => w.postMessage('skipWaiting');
      $('updateBar').hidden = false; $('menuUpdate').hidden = false;
      $('updateNow').onclick = go; $('menuUpdateNow').onclick = go;
      $('updateLater').onclick = () => { $('updateBar').hidden = true; };
    };
    // Check for a new version when the app comes back to the front.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    if (reg.waiting) show(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) show(w); });
    });
  }).catch(() => {});
  // Reload only when a new version takes over, not on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
