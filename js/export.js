// File exports: 16-bit grayscale PNG, 8-bit PNG, binary STL.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(bytes) {
  const cs = new CompressionStream('deflate'); // "deflate" = zlib format, which PNG needs
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}

// Heightmap (0..1 floats) -> 16-bit grayscale PNG Blob. pxPerMm sets the print size (pHYs).
export async function png16(hm, w, h, pxPerMm) {
  const raw = new Uint8Array(h * (1 + w * 2));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 2);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const v = Math.round(Math.min(1, Math.max(0, hm[y * w + x])) * 65535);
      raw[row + 1 + x * 2] = v >> 8; raw[row + 2 + x * 2] = v & 255;
    }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const phys = new Uint8Array(9), pv = new DataView(phys.buffer);
  const ppm = Math.round(pxPerMm * 1000); pv.setUint32(0, ppm); pv.setUint32(4, ppm); phys[8] = 1;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Blob([sig, chunk('IHDR', ihdr), chunk('pHYs', phys), chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}

export function png8(hm, w, h) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = Math.round(hm[i] * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

// Watertight binary STL: relief top, flat bottom, four walls. Sizes in mm.
export function stl(hm, w, h, widthMm, reliefMm, baseMm) {
  const heightMm = widthMm * (h / w);
  const sx = widthMm / (w - 1), sy = heightMm / (h - 1);
  const X = (x) => x * sx, Y = (y) => heightMm - y * sy, Z = (x, y) => baseMm + hm[y * w + x] * reliefMm;
  const nEdge = ((w - 1) + (h - 1)) * 2, nTop = (w - 1) * (h - 1) * 2, nWalls = nEdge * 2, nBottom = nEdge;
  const count = nTop + nWalls + nBottom;
  const buf = new ArrayBuffer(84 + count * 50), dv = new DataView(buf);
  dv.setUint32(80, count, true);
  let o = 84;
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [[nx / l, ny / l, nz / l], a, b, c]) { dv.setFloat32(o, v[0], true); dv.setFloat32(o + 4, v[1], true); dv.setFloat32(o + 8, v[2], true); o += 12; }
    o += 2;
  };
  const P = (x, y) => [X(x), Y(y), Z(x, y)];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const a = P(x, y), b = P(x + 1, y), c = P(x, y + 1), d = P(x + 1, y + 1);
    tri(a, c, b); tri(b, c, d);
  }
  const mid = [widthMm / 2, heightMm / 2, 0];
  // Each edge segment adds two wall triangles and one bottom triangle fanned
  // from the middle, so every edge is shared exactly twice (watertight).
  const wall = (p0, p1) => { // p = [x,y] grid points along the edge, outward-facing
    const t0 = P(...p0), t1 = P(...p1), b0 = [t0[0], t0[1], 0], b1 = [t1[0], t1[1], 0];
    tri(t0, b0, t1); tri(t1, b0, b1); tri(mid, b1, b0);
  };
  for (let x = 0; x < w - 1; x++) { wall([x + 1, 0], [x, 0]); wall([x, h - 1], [x + 1, h - 1]); }
  for (let y = 0; y < h - 1; y++) { wall([0, y], [0, y + 1]); wall([w - 1, y + 1], [w - 1, y]); }
  return new Blob([buf], { type: 'model/stl' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
