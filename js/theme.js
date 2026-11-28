// Screen themes (P3D-015). Colors are the VYBEON swatches, the same set VYBEON Make uses.
export const THEMES = {
  vybeon:   { label: 'VYBEON',   light: 0, bg: '#071338', bg2: '#0d1c4a', text: '#eef3ff', muted: '#9fb0d8', line: 'rgba(255,255,255,.13)', accent: '#2fa8ff', accent2: '#2463ff', g: ['#22c4ff', '#4b6bff', '#b04dff'] },
  blush:    { label: 'Blush',    light: 1, bg: '#F7E4DA', bg2: '#F6DAD0', text: '#4a3942', muted: '#8a7680', line: '#EAC4CC', accent: '#C97E8C', accent2: '#A96573', g: ['#F5CAD3', '#E7AEB5', '#b07784'] },
  mocha:    { label: 'Mocha',    light: 1, bg: '#EDE6DD', bg2: '#E6D8C9', text: '#45301f', muted: '#8a6f58', line: '#DCC3A8', accent: '#A7886C', accent2: '#7A573D', g: ['#D7B795', '#A7886C', '#7A573D'] },
  coastal:  { label: 'Coastal',  light: 1, bg: '#F8F0DF', bg2: '#E8F1EC', text: '#39414b', muted: '#5D636F', line: '#BCDCE0', accent: '#4f8f99', accent2: '#3f7681', g: ['#B6D7DE', '#9fc9cf', '#4f8f99'] },
  linen:    { label: 'Linen',    light: 1, bg: '#F2E9E0', bg2: '#ECEDE9', text: '#443c33', muted: '#80725f', line: '#D7CABC', accent: '#9c8573', accent2: '#7c6959', g: ['#DFD4CA', '#D1BCAE', '#9c8573'] },
  midnight: { label: 'Midnight', light: 0, bg: '#1b2238', bg2: '#111520', text: '#EBE7D8', muted: '#9aabc6', line: '#3a4a6b', accent: '#8aa0c0', accent2: '#51678a', g: ['#465B75', '#788AA8', '#cdd6e6'] },
  rosewood: { label: 'Rosewood', light: 0, bg: '#3F1020', bg2: '#2b0b16', text: '#F3DBC0', muted: '#d7a2a8', line: '#7a3350', accent: '#d07a8a', accent2: '#9e4761', g: ['#963F5F', '#C96A7C', '#F0A9AE'] },
  forest:   { label: 'Forest',   light: 0, bg: '#36473d', bg2: '#232e27', text: '#E4E6DE', muted: '#aab79c', line: '#4c6052', accent: '#86a37b', accent2: '#56734f', g: ['#405842', '#62805C', '#A5B08C'] },
};

const KEY = 'p3d.theme';
export function currentTheme() { const k = localStorage.getItem(KEY); return THEMES[k] ? k : 'vybeon'; }

export function applyTheme(key = currentTheme()) {
  const t = THEMES[key] || THEMES.vybeon;
  localStorage.setItem(KEY, key);
  const r = document.documentElement.style, set = (k, v) => r.setProperty('--' + k, v);
  set('bg', t.bg); set('bg2', t.bg2); set('text', t.text); set('muted', t.muted); set('line', t.line);
  set('accent', t.accent); set('accent2', t.accent2);
  set('glow', `linear-gradient(90deg, ${t.g[0]}, ${t.g[1]}, ${t.g[2]})`);
  set('action', `linear-gradient(135deg, ${t.accent}, ${t.accent2})`);
  set('card', t.light ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.06)');
  set('field', t.light ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.08)');
  set('glass', t.light ? 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.55))' : 'linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05))');
  set('glass-edge', t.light ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.18)');
  set('sheen', t.light ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)');
  set('shadow', t.light ? 'rgba(60,40,30,.18)' : 'rgba(0,0,0,.35)');
  document.documentElement.style.colorScheme = t.light ? 'light' : 'dark';
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = t.bg;
  return t;
}

export function themeGrid(onPick) {
  const cur = currentTheme();
  const wrap = document.createElement('div'); wrap.className = 'themegrid';
  for (const [k, t] of Object.entries(THEMES)) {
    const b = document.createElement('button');
    b.className = 'themecard' + (k === cur ? ' on' : ''); b.type = 'button';
    b.innerHTML = '<span class="swatches">' + [t.g[0], t.g[1], t.accent, t.bg].map((c) => `<i style="background:${c}"></i>`).join('') + '</span><b></b>';
    b.querySelector('b').textContent = t.label;
    b.addEventListener('click', () => { applyTheme(k); wrap.querySelectorAll('.themecard').forEach((x) => x.classList.toggle('on', x === b)); onPick && onPick(k); });
    wrap.append(b);
  }
  return wrap;
}
