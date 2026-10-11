(() => {
  const oklabToRgb = (L, A, B, a) => {
    const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
    const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
    const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const enc = (v) => {
      v = Math.min(1, Math.max(0, v));
      const lin = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.round(lin * 255);
    };
    return [enc(r), enc(g), enc(b), a];
  };
  const oklchToRgb = (L, C, H, a) => {
    const h = H * Math.PI / 180;
    return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h), a);
  };
  const labToRgb = (L, A, B, a) => {
    const e = 216 / 24389, k = 24389 / 27;
    const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
    const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
    const yr = L > k * e ? fy ** 3 : L / k;
    const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
    let X = xr * 0.9642956764, Y = yr, Z = zr * 0.8251046025;
    // Bradford D50 -> D65
    const X2 = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z;
    const Y2 = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z;
    const Z2 = 0.0122982 * X - 0.0204830 * Y + 1.3299098 * Z;
    // XYZ D65 -> linear sRGB
    let r = 3.2404542 * X2 - 1.5371385 * Y2 - 0.4985314 * Z2;
    let g = -0.9692660 * X2 + 1.8760108 * Y2 + 0.0415560 * Z2;
    let b = 0.0556434 * X2 - 0.2040259 * Y2 + 1.0572252 * Z2;
    const enc = (v) => {
      v = Math.min(1, Math.max(0, v));
      const lin = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.round(lin * 255);
    };
    return [enc(r), enc(g), enc(b), a];
  };
  const parseColor = (c) => {
    if (!c) return null;
    let m = c.match(/oklab\(([\d.%]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.%]+))?\)/);
    if (m) {
      const L = m[1].includes('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
      const alpha = m[4] === undefined ? 1 : (m[4].includes('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return oklabToRgb(L, parseFloat(m[2]), parseFloat(m[3]), alpha);
    }
    m = c.match(/oklch\(([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\)/);
    if (m) {
      const L = m[2] === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
      const alpha = m[5] === undefined ? 1 : (m[5].includes('%') ? parseFloat(m[5]) / 100 : parseFloat(m[5]));
      return oklchToRgb(L, parseFloat(m[3]), parseFloat(m[4]), alpha);
    }
    m = c.match(/lab\(([\d.%]+)(?:%)?\s+(-?[\d.]+)%?\s+(-?[\d.]+)%?(?:\s*\/\s*([\d.%]+))?\)/);
    if (m) {
      const L = m[1].includes('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
      const alpha = m[4] === undefined ? 1 : (m[4].includes('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return labToRgb(L, parseFloat(m[2]), parseFloat(m[3]), alpha);
    }
    m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = c.match(/^rgba?\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if (m) {
      const enc = (v) => {
        v = Math.min(1, Math.max(0, v));
        const lin = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        return Math.round(lin * 255);
      };
      return [enc(+m[1]), enc(+m[2]), enc(+m[3]), m[4] === undefined ? 1 : +m[4]];
    }
    if (c === 'transparent') return [0, 0, 0, 0];
    return null;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const L1 = lum(a), L2 = lum(b);
    const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
    return (hi + 0.05) / (lo + 0.05);
  };
  const effBg = (el) => {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
      node = node.parentElement;
    }
    let bg = [255, 255, 255, 1];
    const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
    if (bodyBg && bodyBg[3] >= 1) bg = bodyBg;
    for (let i = stack.length - 1; i >= 0; i--) {
      const [r, g, b, a] = stack[i];
      bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a), 1];
    }
    return bg;
  };
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const cn = (el) => (el && typeof el.className === 'string' ? el.className : '');
  const fmt = (c) => c ? `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}${c[3] < 1 ? ',' + c[3] : ''})` : 'n/a';

  const DEFS = [
    { id: 'banner.warn.body', m: (c) => c.includes('text-amber-200/90') },
    { id: 'banner.warn.title', m: (c) => c.includes('text-amber-100') },
    { id: 'banner.crit.body', m: (c) => c.includes('text-rose-200/90') },
    { id: 'pace.title', m: (c) => c.includes('text-amber-200') && !c.includes('text-amber-200/') },
    { id: 'pace.body', m: (c) => c.includes('text-amber-200/70') },
    { id: 'tech.note', m: (c) => c.includes('text-amber-200/80') },
    { id: 'banner.note.50', m: (c) => c.includes('text-amber-200/50') },
    { id: 'ewma.title', m: (c) => c.includes('text-sky-200') && !c.includes('text-sky-200/') },
    { id: 'ewma.body', m: (c) => c.includes('text-sky-200/70') },
    { id: 'ewma.badge', m: (c) => c.includes('text-sky-300/80') },
    { id: 'ewma.kpi.mono', m: (c) => c.includes('text-sky-300') && !c.includes('text-sky-300/') },
    { id: 'ev.reset', m: (c) => c.includes('text-emerald-400') },
    { id: 'ev.warn', m: (c) => c.includes('text-amber-400') },
    { id: 'ev.crit', m: (c) => c.includes('text-rose-400') },
    { id: 'ev.error', m: (c) => c.includes('text-orange-400') },
    { id: 'diag.rose300', m: (c) => c.includes('text-rose-300') && !c.includes('text-rose-300!') },
    { id: 'diag.emerald300', m: (c) => c.includes('text-emerald-300') && !c.includes('text-emerald-300!') },
    { id: 'sky.400', m: (c) => c.includes('text-sky-400') },
    { id: 'violet.body', m: (c) => c.includes('text-violet-200/70') },
    { id: 'zinc.400', m: (c) => c.includes('text-zinc-400') && !c.includes('!') },
    { id: 'zinc.500', m: (c) => c.includes('text-zinc-500') && !c.includes('!') },
    { id: 'zinc.600', m: (c) => c.includes('text-zinc-600') && !c.includes('!') },
    { id: 'white.40', m: (c) => c.includes('text-white/40') },
    { id: 'white.50', m: (c) => c.includes('text-white/50') },
    { id: 'white.60', m: (c) => c.includes('text-white/60') },
    { id: 'white.70', m: (c) => c.includes('text-white/70') },
    { id: 'tab.active', sel: '[data-slot="tabs-trigger"][data-state="active"]' },
    { id: 'tab.inactive', sel: '[data-slot="tabs-trigger"][data-state="inactive"]' },
    { id: 'chip.on', sel: '[data-slot="toggle-group-item"][data-state="on"]' },
    { id: 'chip.off', sel: '[data-slot="toggle-group-item"][data-state="off"]' }
  ];

  const out = [];
  for (const d of DEFS) {
    let els = [];
    if (d.sel) { els = [...document.querySelectorAll(d.sel)].filter(vis); }
    else { els = [...document.querySelectorAll('*')].filter((e) => d.m(cn(e)) && vis(e)); }
    const samples = [];
    const seen = new Set();
    for (const el of els) {
      if (samples.length >= 3) break;
      const cs = getComputedStyle(el);
      const fgRaw = parseColor(cs.color);
      if (!fgRaw) continue;
      const bg = effBg(el);
      // fusione foreground-alpha sullo sfondo effettivo (alpha compositing sRGB)
      const fg = fgRaw[3] < 1
        ? [fgRaw[0] * fgRaw[3] + bg[0] * (1 - fgRaw[3]), fgRaw[1] * fgRaw[3] + bg[1] * (1 - fgRaw[3]), fgRaw[2] * fgRaw[3] + bg[2] * (1 - fgRaw[3]), 1]
        : fgRaw;
      const key = fmt(fg) + '|' + fmt(bg);
      if (seen.has(key)) continue;
      seen.add(key);
      const ratio = contrast(fg, bg);
      const fs = parseFloat(cs.fontSize);
      const bold = +cs.fontWeight >= 600;
      const large = fs >= 24 || (fs >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const text = (el.textContent || '').trim().slice(0, 40);
      samples.push({ fg: fmt(fg), bg: fmt(bg), ratio: Math.round(ratio * 100) / 100, need, ok: ratio >= need, size: fs, text });
    }
    out.push({ id: d.id, n: els.length, samples });
  }
  return JSON.stringify({ theme: document.documentElement.className, results: out });
})()
