// Turns a raw depth map into an engraving heightmap (0 = lowest, 1 = highest).

// Bilinear resample of a float map to w x h.
export function resample(src, w, h) {
  const out = new Float32Array(w * h);
  const sx = src.w / w, sy = src.h / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), tx = fx - x0;
      const a = src.data[y0 * src.w + x0], b = src.data[y0 * src.w + x1];
      const c = src.data[y1 * src.w + x0], d = src.data[y1 * src.w + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

// Separable box blur, radius r (pixels), repeated `passes` times (~Gaussian).
export function blur(data, w, h, r, passes = 2) {
  r = Math.round(r);
  if (r < 1) return data.slice();
  let a = data.slice(), b = new Float32Array(data.length);
  const line = (src, dst, n, stride, off) => {
    let acc = 0;
    const get = (i) => src[off + Math.min(n - 1, Math.max(0, i)) * stride];
    for (let i = -r; i <= r; i++) acc += get(i);
    const k = 1 / (2 * r + 1);
    for (let i = 0; i < n; i++) {
      dst[off + i * stride] = acc * k;
      acc += get(i + r + 1) - get(i - r);
    }
  };
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) line(a, b, w, 1, y * w);
    for (let x = 0; x < w; x++) line(b, a, h, w, x);
  }
  return a;
}

function percentile(data, q) {
  const step = Math.max(1, Math.floor(data.length / 20000));
  const s = [];
  for (let i = 0; i < data.length; i += step) s.push(data[i]);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function luminance(imgData) {
  const px = imgData.data, n = imgData.width * imgData.height, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  return out;
}

export const DEFAULTS = {
  smooth: 1,       // depth smoothing, % of width x 0.1
  detail: 40,      // bas-relief detail boost, 0-100
  texture: 10,     // photo texture mixed in, 0-100
  gamma: 100,      // 50-200 (100 = linear)
  background: 0,   // cut off the farthest N %, 0-60
  invert: false,   // for lithophanes / negative molds
};

// depth: {w,h,data}; lum: Float32Array at w x h (photo brightness) or null.
// The resampled, normalized depth at one size. Cache it: sliders don't change it.
export function baseDepth(depth, w, h) {
  const d = resample(depth, w, h);
  const lo = percentile(d, 0.01), hi = percentile(d, 0.995);
  const span = hi - lo || 1;
  for (let i = 0; i < d.length; i++) d[i] = Math.min(1, Math.max(0, (d[i] - lo) / span));
  return d;
}

// base: from baseDepth() (pass it to skip recomputing); it is not modified.
export function makeHeightmap(depth, lum, w, h, o, base) {
  let d = base ? base.slice() : baseDepth(depth, w, h);

  const scale = w / 1000;
  if (o.smooth > 0) d = blur(d, w, h, o.smooth * scale * 2);

  // Bas-relief: compress big depth jumps and boost local detail (unsharp mask on depth).
  if (o.detail > 0) {
    const base = blur(d, w, h, Math.max(2, 25 * scale), 3);
    const k = o.detail / 100;
    for (let i = 0; i < d.length; i++) d[i] = base[i] * (1 - 0.5 * k) + (d[i] - base[i]) * (1 + 3 * k) + 0.25 * k;
  }
  // Photo texture: high-pass of the photo's brightness (hair, fabric, wood grain).
  if (lum && o.texture > 0) {
    const lb = blur(lum, w, h, Math.max(2, 6 * scale), 2);
    const k = (o.texture / 100) * 0.35;
    for (let i = 0; i < d.length; i++) d[i] += (lum[i] - lb[i]) * k;
  }
  // Re-normalize.
  const lo2 = percentile(d, 0.005), hi2 = percentile(d, 0.998), sp2 = hi2 - lo2 || 1;
  const cut = o.background / 100, g = 100 / o.gamma;
  for (let i = 0; i < d.length; i++) {
    let v = Math.min(1, Math.max(0, (d[i] - lo2) / sp2));
    if (cut > 0) v = v <= cut ? 0 : (v - cut) / (1 - cut);
    v = Math.pow(v, g);
    d[i] = o.invert ? 1 - v : v;
  }
  return d;
}

// Grayscale or shaded preview into an ImageData.
export function renderPreview(hm, w, h, mode, reliefMm = 3, mmPerPx = 0.2, into = null) {
  const img = into || new ImageData(w, h), p = img.data;
  if (mode === 'shaded') {
    const z = reliefMm / mmPerPx;
    const L = [-0.5, -0.6, 0.62];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = (hm[y * w + Math.min(w - 1, x + 1)] - hm[y * w + Math.max(0, x - 1)]) * z * 0.5;
      const dy = (hm[Math.min(h - 1, y + 1) * w + x] - hm[Math.max(0, y - 1) * w + x]) * z * 0.5;
      const n = 1 / Math.hypot(dx, dy, 1);
      const s = Math.max(0, (-dx * L[0] - dy * L[1] + L[2]) * n);
      const v = Math.round(40 + 200 * s);
      p[i * 4] = v; p[i * 4 + 1] = Math.round(v * 0.93); p[i * 4 + 2] = Math.round(v * 0.82); p[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      const v = Math.round(hm[i] * 255);
      p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; p[i * 4 + 3] = 255;
    }
  }
  return img;
}
