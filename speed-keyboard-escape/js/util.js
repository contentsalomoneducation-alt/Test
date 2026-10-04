/* Tiện ích dùng chung: toán, RNG, định dạng số, lưu trữ, DOM, texture chữ */
(function () {
  'use strict';
  const SKE = (window.SKE = window.SKE || {});
  const U = (SKE.util = {});

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  U.approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
  U.angleDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  // mulberry32
  U.rng = (seed) => {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  U.fmt = (n) => {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + U.fmt(-n);
    if (n < 1000) {
      if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
      return (Math.round(n * 10) / 10).toString();
    }
    const tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUF.length) return n.toExponential(2).replace('+', '');
    const v = n / Math.pow(10, tier * 3);
    const dec = v < 10 ? 2 : v < 100 ? 1 : 0;
    return parseFloat(v.toFixed(dec)).toString() + SUF[tier];
  };
  U.fmtInt = (n) => U.fmt(Math.floor(n));
  U.fmtMult = (m) => '×' + U.fmt(m);

  U.load = (key, fallback) => {
    try {
      const s = window.localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) {
      return fallback;
    }
  };
  U.save = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  };

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  U.hex = (h) => new window.THREE.Color(h);

  /** Canvas texture chữ (dùng cho sprite biển hiệu) */
  U.textTexture = (text, o) => {
    o = o || {};
    const w = o.w || 512;
    const h = o.h || 128;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const lines = Array.isArray(text) ? text : [text];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const lh = h / lines.length;
    lines.forEach((ln, i) => {
      const sizeBase = (o.sizes && o.sizes[i]) || lh * 0.72;
      let size = sizeBase;
      g.font = `800 ${size}px ${SKE.FONT}`;
      const maxW = w * 0.94;
      const m = g.measureText(ln).width;
      if (m > maxW) size = size * (maxW / m);
      g.font = `800 ${size}px ${SKE.FONT}`;
      const y = lh * (i + 0.5);
      g.lineWidth = o.stroke != null ? o.stroke : size * 0.2;
      g.strokeStyle = (o.strokeColors && o.strokeColors[i]) || o.strokeColor || '#3b1f4a';
      g.strokeText(ln, w / 2, y);
      g.fillStyle = (o.fills && o.fills[i]) || o.fill || '#ffffff';
      g.fillText(ln, w / 2, y);
    });
    const tex = new window.THREE.CanvasTexture(c);
    tex.colorSpace = window.THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData = { canvas: c };
    return tex;
  };

  SKE.FONT = '"Fredoka","Baloo 2","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
})();
