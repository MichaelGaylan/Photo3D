// Runs the AI depth model in its own worker. When the worker is closed, the
// browser frees all of the model's memory. On the main page the WebAssembly
// memory would stay at its peak size until reload, and that left too little
// room for the sliders on iPhone.
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

self.onmessage = async (e) => {
  const { blob, model, device, dtype, threads } = e.data;
  try {
    const T = await import(TRANSFORMERS);
    T.env.allowLocalModels = false;
    if (threads) T.env.backends.onnx.wasm.numThreads = threads;
    const pipe = await T.pipeline('depth-estimation', model, {
      device, dtype,
      progress_callback: (p) => self.postMessage({ type: 'progress', p: { status: p.status, file: p.file, loaded: p.loaded, total: p.total } }),
    });
    self.postMessage({ type: 'running' });
    const url = URL.createObjectURL(blob);
    const out = await pipe(url);
    URL.revokeObjectURL(url);
    const t = out.predicted_depth, dims = t.dims;
    const h = dims[dims.length - 2], w = dims[dims.length - 1];
    const data = Float32Array.from(t.data);
    self.postMessage({ type: 'done', w, h, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
