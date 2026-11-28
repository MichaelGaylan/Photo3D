// Depth estimation in the browser.
// "ai": Depth Anything V2 Small through transformers.js (WebGPU when available, else WebAssembly).
// "quick": no download; a soft brightness-based relief, for offline use or very old phones.
import { DEPTH_MODEL } from './config.js';

let pipePromise = null;
let usedDevice = '';

// iPhone/iPad Safari closes a tab that uses too much memory, which looks like
// the app jumping back to the start. So on iOS: no WebGPU, the smaller 8-bit
// model, one thread, and a small input image.
export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MODEL_INPUT = IS_IOS ? 640 : 1024; // the model works at ~518 px anyway

// Devices that crashed the page last time are skipped (see app.js).
let avoid = [];
export function avoidDevices(list) { avoid = list || []; }

async function loadPipe(onProgress) {
  // Pinned version from jsDelivr; the browser caches it after the first AI run.
  const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js');
  T.env.allowLocalModels = false;
  if (IS_IOS) T.env.backends.onnx.wasm.numThreads = 1;
  const hasGPU = !IS_IOS && !avoid.includes('webgpu') && 'gpu' in navigator && !!(await navigator.gpu.requestAdapter().catch(() => null));
  const tries = (hasGPU ? [['webgpu', 'fp16'], ['wasm', 'q8']] : [['wasm', 'q8']]);
  let lastErr;
  for (const [device, dtype] of tries) {
    try {
      usedDevice = device;
      onProgress && onProgress({ status: 'device', device });
      return await T.pipeline('depth-estimation', DEPTH_MODEL, { device, dtype, progress_callback: onProgress });
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export function depthDevice() { return usedDevice; }

// Returns { w, h, data: Float32Array } where larger = nearer, any range.
export async function estimateDepth(canvas, mode, onProgress) {
  if (mode === 'quick') return quickDepth(canvas);
  if (!pipePromise) pipePromise = loadPipe(onProgress).catch((e) => { pipePromise = null; throw e; });
  const pipe = await pipePromise;
  onProgress && onProgress({ status: 'running' });
  const k = Math.min(1, MODEL_INPUT / Math.max(canvas.width, canvas.height));
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * k); small.height = Math.round(canvas.height * k);
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  const blob = await new Promise((r) => small.toBlob(r, 'image/jpeg', 0.95));
  const url = URL.createObjectURL(blob);
  try {
    const out = await pipe(url);
    const t = out.predicted_depth;
    const dims = t.dims;
    const h = dims[dims.length - 2], w = dims[dims.length - 1];
    return { w, h, data: Float32Array.from(t.data) };
  } finally { URL.revokeObjectURL(url); }
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
