// Photo cleanup before depth (P3D-009): removes dust and specks (median filter),
// evens out uneven lighting (divides out a very soft brightness map), and stretches
// the levels so the darkest and brightest parts use the full range.
import { blur } from './relief.js';

// 3x3 median of one channel into out (fast 19-step sorting network).
function median3(src, out, w, h, ch) {
  for (let y = 0; y < h; y++) {
    const r0 = Math.max(0, y - 1) * w, r1 = y * w, r2 = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - 1), xb = Math.min(w - 1, x + 1);
      let p0 = src[(r0 + xa) * 4 + ch], p1 = src[(r0 + x) * 4 + ch], p2 = src[(r0 + xb) * 4 + ch];
      let p3 = src[(r1 + xa) * 4 + ch], p4 = src[(r1 + x) * 4 + ch], p5 = src[(r1 + xb) * 4 + ch];
      let p6 = src[(r2 + xa) * 4 + ch], p7 = src[(r2 + x) * 4 + ch], p8 = src[(r2 + xb) * 4 + ch], t;
      if (p1 > p2) { t = p1; p1 = p2; p2 = t; } if (p4 > p5) { t = p4; p4 = p5; p5 = t; } if (p7 > p8) { t = p7; p7 = p8; p8 = t; }
      if (p0 > p1) { t = p0; p0 = p1; p1 = t; } if (p3 > p4) { t = p3; p3 = p4; p4 = t; } if (p6 > p7) { t = p6; p6 = p7; p7 = t; }
      if (p1 > p2) { t = p1; p1 = p2; p2 = t; } if (p4 > p5) { t = p4; p4 = p5; p5 = t; } if (p7 > p8) { t = p7; p7 = p8; p8 = t; }
      if (p0 > p3) { t = p0; p0 = p3; p3 = t; } if (p5 > p8) { t = p5; p5 = p8; p8 = t; } if (p4 > p7) { t = p4; p4 = p7; p7 = t; }
      if (p3 > p6) { t = p3; p3 = p6; p6 = t; } if (p1 > p4) { t = p1; p1 = p4; p4 = t; } if (p2 > p5) { t = p2; p2 = p5; p5 = t; }
      if (p4 > p7) { t = p4; p4 = p7; p7 = t; } if (p4 > p2) { t = p4; p4 = p2; p2 = t; } if (p6 > p4) { t = p6; p6 = p4; p4 = t; }
      if (p4 > p2) { t = p4; p4 = p2; p2 = t; }
      out[(r1 + x) * 4 + ch] = p4;
    }
  }
}

// strength 0..100. Returns a new canvas; the source is not changed.
export function cleanupPhoto(src, strength = 60) {
  const w = src.width, h = src.height, k = strength / 100;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h), px = img.data;

  // 1. Dust and specks: median per channel, blended by strength.
  const med = new Uint8ClampedArray(px.length);
  for (let ch = 0; ch < 3; ch++) median3(px, med, w, h, ch);
  for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch++) px[i + ch] = px[i + ch] + (med[i + ch] - px[i + ch]) * Math.min(1, k * 1.5);

  // 2. Even lighting: brightness / very soft brightness, scaled back to the average.
  const n = w * h, lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255 + 0.02;
  const soft = blur(lum, w, h, Math.max(4, Math.round(Math.max(w, h) / 12)), 2);
  let mean = 0; for (let i = 0; i < n; i++) mean += soft[i]; mean /= n;
  const even = 0.7 * k;
  for (let i = 0; i < n; i++) {
    const f = 1 + ((mean / soft[i]) - 1) * even;
    px[i * 4] *= f; px[i * 4 + 1] *= f; px[i * 4 + 2] *= f;
  }

  // 3. Levels: stretch the 0.5% to 99.5% brightness range.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2])]++;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.005) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.005) break; }
  if (hi - lo > 10) {
    const s = 255 / (hi - lo), mix = k;
    for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch++) px[i + ch] = px[i + ch] + ((px[i + ch] - lo) * s - px[i + ch]) * mix;
  }
  g.putImageData(img, 0, 0);
  return c;
}
