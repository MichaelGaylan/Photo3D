import { APP_NAME, VERSION, BUILD, WHATS_NEW, W3F_KEY, REPORT_PREFIX } from './config.js';
import { estimateDepth, depthDevice, avoidDevices, IS_IOS } from './depth.js';
import { makeHeightmap, renderPreview, luminance, DEFAULTS } from './relief.js';
import { png16, png8, stl, download } from './export.js';

const $ = (id) => document.getElementById(id);
const MAX_PHOTO = 2048;   // longest side kept from the photo
const PREVIEW = 720;      // longest side of the live preview
const MAX_STL = 600;      // longest side of the STL grid (keeps files under ~45 MB)

const state = { photo: null, depth: null, view: 'shaded', opts: { ...DEFAULTS }, name: 'relief' };

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

// ---------- 1. Photo ----------
for (const inp of [$('camIn'), $('fileIn')]) inp.addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  e.target.value = '';
  await loadPhoto(f, (f.name || 'relief').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_') || 'relief', true);
});

async function loadPhoto(f, name, save) {
  state.name = name;
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
  const s = Math.min(1, MAX_PHOTO / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  state.photo = c; state.depth = null;
  $('stepDepth').hidden = false; $('stepAdjust').hidden = true; $('stepExport').hidden = true;
  bmp.close && bmp.close();
  setStatus('Photo ready: ' + c.width + ' × ' + c.height + ' px.');
  $('stepDepth').scrollIntoView({ behavior: 'smooth' });
  if (save) c.toBlob((b) => kv('photo', { blob: b, name }).catch(() => {}), 'image/jpeg', 0.92);
}

if (crashedOn) {
  kv('photo').then(async (saved) => {
    if (saved && saved.blob) await loadPhoto(saved.blob, saved.name, false);
    setStatus(crashedOn === 'webgpu'
      ? 'AI depth closed the page last time. Your photo is back. Tap Make relief to try the lighter AI mode.'
      : 'AI depth needs more memory than this browser allows, so Quick is selected. Your photo is back.');
    if (crashedOn !== 'webgpu') document.querySelector('input[value=quick]').checked = true;
  }).catch(() => {});
}

// ---------- 2. Depth ----------
function setStatus(text, frac) {
  $('status').innerHTML = '';
  $('status').append(text);
  if (frac != null) { const b = document.createElement('div'); b.className = 'bar'; b.innerHTML = '<i></i>'; b.firstChild.style.width = Math.round(frac * 100) + '%'; $('status').append(b); }
}

const files = {};
function onProgress(p) {
  if (p.status === 'device') { localStorage.setItem(ATTEMPT, p.device); return; }
  if (p.status === 'running') { setStatus('Working out the depth… this can take 10 to 20 seconds on a phone.'); return; }
  if (p.status === 'progress' && p.total) {
    files[p.file] = [p.loaded, p.total];
    const v = Object.values(files), l = v.reduce((a, x) => a + x[0], 0), t = v.reduce((a, x) => a + x[1], 0);
    setStatus('Downloading the depth model (first time only): ' + (l / 1e6).toFixed(0) + ' of ' + (t / 1e6).toFixed(0) + ' MB', l / t);
  }
}

$('runBtn').addEventListener('click', async () => {
  if (!state.photo) return;
  const mode = document.querySelector('input[name=mode]:checked').value;
  $('runBtn').disabled = true;
  const t0 = performance.now();
  try {
    if (mode === 'ai') localStorage.setItem(ATTEMPT, 'loading');
    setStatus(mode === 'ai' ? 'Loading the depth model…' : 'Working…');
    state.depth = await estimateDepth(state.photo, mode, onProgress);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus((mode === 'ai' ? 'AI depth done on ' + (depthDevice() === 'webgpu' ? 'GPU' : 'CPU') : 'Quick depth done') + ' in ' + secs + ' s.');
    $('stepAdjust').hidden = false; $('stepExport').hidden = false;
    redraw(); updateSize();
    $('stepAdjust').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    setStatus('Could not make AI depth on this device (' + (err && err.message || err) + '). Try Quick, or check your connection for the first download.');
  } finally { localStorage.removeItem(ATTEMPT); $('runBtn').disabled = false; }
});

// ---------- 3. Adjust ----------
const SLIDERS = ['detail', 'texture', 'smooth', 'gamma', 'background'];
for (const k of SLIDERS) {
  $(k).value = state.opts[k];
  $(k).addEventListener('input', () => { state.opts[k] = +$(k).value; schedule(); });
}
$('invert').addEventListener('change', () => { state.opts.invert = $('invert').checked; schedule(); });
for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => {
  document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
  state.view = b.dataset.view; redraw();
});

let pending = 0;
function schedule() { cancelAnimationFrame(pending); pending = requestAnimationFrame(redraw); }

function lumAt(w, h) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  g.drawImage(state.photo, 0, 0, w, h);
  return { lum: luminance(g.getImageData(0, 0, w, h)), canvas: c };
}

function sizeFor(longest) {
  const p = state.photo, s = longest / Math.max(p.width, p.height);
  return [Math.max(2, Math.round(p.width * s)), Math.max(2, Math.round(p.height * s))];
}

function redraw() {
  if (!state.depth) return;
  const [w, h] = sizeFor(Math.min(PREVIEW, Math.max(state.photo.width, state.photo.height)));
  const cv = $('preview'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (state.view === 'photo') { g.drawImage(state.photo, 0, 0, w, h); return; }
  const { lum } = lumAt(w, h);
  const hm = makeHeightmap(state.depth, lum, w, h, state.opts);
  const widthMm = +$('widthMm').value || 100;
  g.putImageData(renderPreview(hm, w, h, state.view === 'shaded' ? 'shaded' : 'height', +$('reliefMm').value || 3, widthMm / w), 0, 0);
}

// ---------- 4. Size and export ----------
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

for (const b of document.querySelectorAll('[data-export]')) b.addEventListener('click', async () => {
  if (!state.depth) return;
  const kind = b.dataset.export; b.disabled = true;
  try {
    const [w, h] = exportSize(kind);
    const { lum } = lumAt(w, h);
    const hm = makeHeightmap(state.depth, lum, w, h, state.opts);
    const widthMm = +$('widthMm').value || 100;
    const tag = state.name + '_' + widthMm + 'mm';
    if (kind === 'png16') download(await png16(hm, w, h, w / widthMm), tag + '_16bit.png');
    if (kind === 'png8') download(await png8(hm, w, h), tag + '_8bit.png');
    if (kind === 'stl') download(stl(hm, w, h, widthMm, +$('reliefMm').value || 3, +$('baseMm').value || 0), tag + '.stl');
  } catch (err) { console.error(err); alertStatus('Export failed: ' + (err && err.message || err)); }
  finally { b.disabled = false; }
});
function alertStatus(t) { $('sizeInfo').textContent = t; }

// ---------- Menu, What's new, Report a problem ----------
$('ver').textContent = APP_NAME + ' ' + VERSION + ' · build ' + BUILD;
$('whatsNew').innerHTML = WHATS_NEW.map(([v, t]) => '<li><b>' + v + '</b> ' + t.replace(/</g, '&lt;') + '</li>').join('');
$('menuBtn').addEventListener('click', () => $('menu').showModal());
$('closeMenu').addEventListener('click', () => $('menu').close());
if (!W3F_KEY) $('sendReport').hidden = true;

function reportBody() {
  return $('reportText').value.trim() + '\n\n— ' + APP_NAME + ' ' + VERSION + ' (' + BUILD + ')\n' + navigator.userAgent + '\nDepth: ' + (depthDevice() || 'not run');
}
$('copyReport').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(reportBody()); $('reportStatus').textContent = 'Copied.'; } catch { $('reportStatus').textContent = 'Could not copy.'; }
});
$('sendReport').addEventListener('click', async () => {
  const subject = ($('reportText').value.trim().split('\n')[0] || 'Problem').slice(0, 80);
  $('reportStatus').textContent = 'Sending…';
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: W3F_KEY, subject: REPORT_PREFIX + ' ' + subject, from_name: APP_NAME, botcheck: '', message: reportBody() }),
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
    const show = (w) => { $('updateBar').hidden = false; $('updateNow').onclick = () => w.postMessage('skipWaiting'); };
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
