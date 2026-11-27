// Depth estimation in the browser.
// "ai": Depth Anything V2 Small through transformers.js (WebGPU when available, else WebAssembly).
// "quick": no download; a soft brightness-based relief, for offline use or very old phones.
import { DEPTH_MODEL } from './config.js';

let pipePromise = null;
let usedDevice = '';

async function loadPipe(onProgress) {
  // Pinned version from jsDelivr; the browser caches it after the first AI run.
  const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js');
  T.env.allowLocalModels = false;
  const hasGPU = 'gpu' in navigator && !!(await navigator.gpu.requestAdapter().catch(() => null));
  const tries = hasGPU ? [['webgpu', 'fp16'], ['wasm', 'q8']] : [['wasm', 'q8']];
  let lastErr;
  for (const [device, dtype] of tries) {
    try {
      const p = await T.pipeline('depth-estimation', DEPTH_MODEL, { device, dtype, progress_callback: onProgress });
      usedDevice = device;
      return p;
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
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
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
