// Runs the AI depth model in its own worker. When the worker is closed, the
// browser frees all of the model's memory. On the main page the WebAssembly
// memory would stay at its peak size until reload, and that left too little
// room for the sliders on iPhone.
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

self.onmessage = async (e) => {
  // blobs: one image, or the whole photo followed by its tiles (Extra detail).
  const { blobs, model, device, dtype, threads } = e.data;
  try {
    const T = await import(TRANSFORMERS);
    T.env.allowLocalModels = false;
    if (threads) T.env.backends.onnx.wasm.numThreads = threads;
    const pipe = await T.pipeline('depth-estimation', model, {
      device, dtype,
      progress_callback: (p) => self.postMessage({ type: 'progress', p: { status: p.status, file: p.file, loaded: p.loaded, total: p.total } }),
    });
    const maps = [];
    for (let i = 0; i < blobs.length; i++) {
      self.postMessage({ type: 'running', i, n: blobs.length });
      const url = URL.createObjectURL(blobs[i]);
      const out = await pipe(url);
      URL.revokeObjectURL(url);
      const t = out.predicted_depth, dims = t.dims;
      maps.push({ h: dims[dims.length - 2], w: dims[dims.length - 1], data: Float32Array.from(t.data) });
      if (t.dispose) t.dispose();
    }
    self.postMessage({ type: 'done', maps }, maps.map((m) => m.data.buffer));
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
