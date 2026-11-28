// Depth estimation in the browser.
// "ai": Depth Anything V2 Small through transformers.js (WebGPU when available, else WebAssembly).
// "quick": no download; a soft brightness-based relief, for offline use or very old phones.
import { DEPTH_MODEL } from './config.js';
import { resample, blur } from './relief.js';

let usedDevice = '';

// iPhone/iPad Safari closes a tab that uses too much memory, which looks like
// the app jumping back to the start. So on iOS: no WebGPU, the smaller 8-bit
// model, one thread, and a small input image.
export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MODEL_INPUT = IS_IOS ? 640 : 1024; // the model works at ~518 px anyway

// Devices that crashed the page last time are skipped (see app.js).
let avoid = [];
export function avoidDevices(list) { avoid = list || []; }

// One run in a fresh worker; the worker is always closed afterwards (frees all model memory).
function runWorker(blobs, device, dtype, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./depth-worker.js', import.meta.url), { type: 'module' });
    const done = (fn, v) => { w.terminate(); fn(v); };
    w.onmessage = ({ data: m }) => {
      if (m.type === 'progress') onProgress && onProgress(m.p);
      else if (m.type === 'running') onProgress && onProgress({ status: 'running', i: m.i, n: m.n });
      else if (m.type === 'done') done(resolve, m.maps);
      else if (m.type === 'error') done(reject, new Error(m.message));
    };
    w.onerror = (ev) => { ev.preventDefault && ev.preventDefault(); done(reject, new Error(ev.message || 'The depth worker failed to start')); };
    w.postMessage({ blobs, model: DEPTH_MODEL, device, dtype, threads: IS_IOS ? 1 : 0 });
  });
}

export function depthDevice() { return usedDevice; }

// Part of the photo (sx, sy, sw, sh in photo pixels) as a JPEG of at most `max` px.
async function jpeg(canvas, sx, sy, sw, sh, max) {
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
  c.width = c.height = 0;
  return blob;
}

// Extra detail: the whole photo plus 2 x 2 overlapping tiles. Each tile sees its part
// of the photo at full model resolution, so fine detail (hair, lettering, carving) is sharper.
const OVERLAP = 0.18;
function tileRects(W, H) {
  const tw = Math.round(W * (0.5 + OVERLAP / 2)), th = Math.round(H * (0.5 + OVERLAP / 2));
  return [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]].map(([x, y]) => [x, y, tw, th]);
}

// Returns { w, h, data: Float32Array } where larger = nearer, any range.
export async function estimateDepth(canvas, mode, onProgress, tiled = false) {
  if (mode === 'quick') return quickDepth(canvas);
  const W = canvas.width, H = canvas.height;
  const rects = tiled ? tileRects(W, H) : [];
  const blobs = [await jpeg(canvas, 0, 0, W, H, MODEL_INPUT)];
  for (const [x, y, w, h] of rects) blobs.push(await jpeg(canvas, x, y, w, h, MODEL_INPUT));
  const hasGPU = !IS_IOS && !avoid.includes('webgpu') && 'gpu' in navigator && !!(await navigator.gpu.requestAdapter().catch(() => null));
  const tries = hasGPU ? [['webgpu', 'fp16'], ['wasm', 'q8']] : [['wasm', 'q8']];
  let lastErr;
  for (const [device, dtype] of tries) {
    let maps;
    try {
      usedDevice = device;
      onProgress && onProgress({ status: 'device', device });
      maps = await runWorker(blobs, device, dtype, onProgress);
    } catch (e) { lastErr = e; continue; }
    return tiled ? mergeTiles(maps, rects, W, H) : maps[0];
  }
  throw lastErr;
}

// Puts the tiles together: each tile is matched to the whole-photo depth (scale and
// offset), blended with soft edges, and the overall shape is taken from the whole photo
// so the tiles can't drift apart. Only the fine detail comes from the tiles.
export function mergeTiles(maps, rects, W, H) {
  const long = IS_IOS ? 1024 : 1536; // output size: bounded for phone memory
  const s = Math.min(1, long / Math.max(W, H));
  const ow = Math.max(2, Math.round(W * s)), oh = Math.max(2, Math.round(H * s));
  const g = resample(maps[0], ow, oh);
  const acc = new Float32Array(ow * oh), wsum = new Float32Array(ow * oh);
  for (let t = 0; t < rects.length; t++) {
    const [rx, ry, rw, rh] = rects[t];
    const x0 = Math.round(rx * s), y0 = Math.round(ry * s);
    const tw = Math.min(ow - x0, Math.round(rw * s)), th = Math.min(oh - y0, Math.round(rh * s));
    const tile = resample(maps[t + 1], tw, th);
    // Least-squares fit tile -> whole-photo depth over the tile.
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const a = tile[y * tw + x], b = g[(y0 + y) * ow + x0 + x];
      n++; sx += a; sy += b; sxx += a * a; sxy += a * b;
    }
    const den = n * sxx - sx * sx, k = den ? (n * sxy - sx * sy) / den : 1, c = (sy - k * sx) / n;
    // Feather: weight falls to ~0 at the tile edges that lie inside the photo.
    const fx = Math.max(1, tw * OVERLAP * 1.2), fy = Math.max(1, th * OVERLAP * 1.2);
    for (let y = 0; y < th; y++) {
      const ey = Math.min(y0 === 0 ? Infinity : y, y0 + th >= oh ? Infinity : th - 1 - y);
      const wy = Math.min(1, (ey + 0.5) / fy);
      for (let x = 0; x < tw; x++) {
        const ex = Math.min(x0 === 0 ? Infinity : x, x0 + tw >= ow ? Infinity : tw - 1 - x);
        const wgt = Math.max(1e-4, wy * Math.min(1, (ex + 0.5) / fx));
        const o = (y0 + y) * ow + x0 + x;
        acc[o] += (tile[y * tw + x] * k + c) * wgt; wsum[o] += wgt;
      }
    }
  }
  for (let i = 0; i < acc.length; i++) acc[i] = wsum[i] ? acc[i] / wsum[i] : g[i];
  // final = tiles + soft(whole - tiles): the shape of the whole photo, the detail of the tiles.
  const r = Math.max(4, Math.round(Math.max(ow, oh) / 40));
  for (let i = 0; i < g.length; i++) g[i] -= acc[i];
  const lowDiff = blur(g, ow, oh, r, 3);
  for (let i = 0; i < acc.length; i++) acc[i] += lowDiff[i];
  return { w: ow, h: oh, data: acc };
}

function quickDepth(canvas) {
  const w = Math.min(canvas.width, 640);
  const h = Math.round(canvas.height * (w / canvas.width));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  return { w, h, data: d };
}
