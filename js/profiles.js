// Machine profiles and the calibration test card (P3D-007).
// A profile fills in size, relief depth, base, resolution and the export it suits.
// These are starting points; run the test card on your machine and material, then adjust.
export const PROFILES = {
  custom:  { label: 'Custom (my own settings)' },
  diode:   { label: 'Diode laser · wood, leather, slate', widthMm: 100, reliefMm: 1, baseMm: 0, pxPerMm: 10, export: 'png8', invert: false,
             tip: 'Grayscale 3D engraving: in LightBurn use Grayscale mode; white stays high, black burns deepest. Several slow passes carve deeper.' },
  co2:     { label: 'CO2 laser · wood, acrylic, stone', widthMm: 150, reliefMm: 2, baseMm: 0, pxPerMm: 10, export: 'png8', invert: false,
             tip: 'Grayscale 3D engraving in LightBurn or RDWorks. Test acrylic at low power first; it melts quickly.' },
  fiber:   { label: 'Fiber laser · metal (3D slice)', widthMm: 60, reliefMm: 0.4, baseMm: 0, pxPerMm: 20, export: 'png16', invert: false,
             tip: 'For LightBurn 3D Slice on fiber lasers. Depth comes from many passes; keep reliefs shallow on metal.' },
  cnc:     { label: 'CNC router · wood signs and plaques', widthMm: 200, reliefMm: 6, baseMm: 3, pxPerMm: 10, export: 'png16', invert: false,
             tip: 'Import the 16-bit PNG or the STL into Vectric, Carveco or Fusion. Rough with a flat end mill, finish with a 1/16" or 1/8" ball nose.' },
  cncfine: { label: 'CNC · fine detail (small ball nose)', widthMm: 120, reliefMm: 3, baseMm: 2, pxPerMm: 15, export: 'png16', invert: false,
             tip: 'For a 1/32" or 0.5 mm ball nose: shallow relief, high resolution, step-over 8 to 10%.' },
  litho:   { label: '3D printer · lithophane', widthMm: 100, reliefMm: 2.4, baseMm: 0.8, pxPerMm: 5, export: 'stl', invert: true,
             tip: 'Print upright at 100% infill in white PLA; thick parts show dark when lit from behind.' },
  print:   { label: '3D printer · relief plaque', widthMm: 100, reliefMm: 4, baseMm: 2, pxPerMm: 5, export: 'stl', invert: false,
             tip: 'Print flat with a 0.4 mm nozzle and 0.12 mm layers for smooth slopes.' },
};

const KEY = 'p3d.profile';
export function savedProfile() { return localStorage.getItem(KEY) || 'custom'; }
export function saveProfile(k) { localStorage.setItem(KEY, k); }

// Test card heightmap (0..1 floats): ten depth steps labeled 0% (top) to 100% (deepest), a smooth ramp, and fine detail rings,
// so you can see how deep each gray level carves and how much detail your tool holds.
export function testCard(widthMm, pxPerMm) {
  const w = Math.max(200, Math.round(widthMm * pxPerMm)), h = Math.round(w * 0.6);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const pad = Math.round(w * 0.03), steps = 10, sw = (w - pad * 2) / steps, sh = h * 0.34;
  g.font = `bold ${Math.round(sw * 0.28)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < steps; i++) {
    const v = Math.round(255 * (1 - i / (steps - 1)));
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(pad + i * sw, pad, sw, sh);
    g.fillStyle = v > 128 ? '#000' : '#fff'; g.fillText(Math.round(i / (steps - 1) * 100) + '%', pad + i * sw + sw / 2, pad + sh / 2);
  }
  const ry = pad * 2 + sh, rh = h * 0.16, grd = g.createLinearGradient(pad, 0, w - pad, 0);
  grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(pad, ry, w - pad * 2, rh);
  // Fine detail: concentric rings that get closer together, plus line widths.
  const cy = ry + rh + pad + (h - ry - rh - pad * 2) / 2, rmax = (h - ry - rh - pad * 2) / 2;
  for (let k = 0; k < 3; k++) {
    const cx = pad + rmax + k * (rmax * 2 + pad), period = [8, 4, 2][k] * pxPerMm / 10;
    for (let r = rmax; r > 0; r -= period) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = (Math.round(r / period) % 2) ? '#000' : '#fff'; g.fill(); }
  }
  const lx = pad + 3 * (rmax * 2 + pad) + pad;
  for (let k = 0; k < 6; k++) {
    const lw = (k + 1) * 0.2 * pxPerMm; // 0.2 mm to 1.2 mm lines
    g.fillStyle = '#000'; g.fillRect(lx + k * (w - lx - pad) / 6, cy - rmax, lw, rmax * 2);
  }
  const px = g.getImageData(0, 0, w, h).data, hm = new Float32Array(w * h);
  for (let i = 0; i < hm.length; i++) hm[i] = px[i * 4] / 255;
  c.width = c.height = 0;
  return { hm, w, h };
}
