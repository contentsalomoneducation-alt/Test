/* Thế giới: bàn phím kẹo khổng lồ, 13 stage, lobby, vật cản, lưới va chạm */
(function () {
  'use strict';
  const SKE = window.SKE;
  const THREE = window.THREE;
  const U = SKE.util;
  const D = SKE.data;
  const E = SKE.entities;

  const KU = 4.4; // bề rộng 1 phím
  const KG = 0.5; // khe giữa các phím
  const KP = KU + KG; // bước phím
  const KH = 1.6; // chiều cao thân phím
  const CAPH = 0.7; // chiều cao mũ phím
  const SEA_Y = -14;
  const KILL_Y = -17;

  const HEAD = {
    N: { f: [0, -1], r: [1, 0], yaw: 0 },
    E: { f: [1, 0], r: [0, 1], yaw: -Math.PI / 2 },
    W: { f: [-1, 0], r: [0, -1], yaw: Math.PI / 2 },
  };

  // ============================================================ Geometry builder
  class GB {
    constructor() {
      this.p = [];
      this.n = [];
      this.c = [];
      this.u = [];
      this.i = [];
      this.v = 0;
    }
    quad(a, b, c, d, col, ctr) {
      let e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      let e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (ctr) {
        const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - ctr[0];
        const my = (a[1] + b[1] + c[1] + d[1]) / 4 - ctr[1];
        const mz = (a[2] + b[2] + c[2] + d[2]) / 4 - ctr[2];
        if (nx * mx + ny * my + nz * mz < 0) {
          const t = b; b = d; d = t;
          nx = -nx; ny = -ny; nz = -nz;
        }
      }
      const v0 = this.v;
      [a, b, c, d].forEach((q) => {
        this.p.push(q[0], q[1], q[2]);
        this.n.push(nx, ny, nz);
        this.c.push(col.r, col.g, col.b);
      });
      this.i.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      this.v += 4;
    }
    /** Khối (có thể vát: i0 = thụt đáy, i1 = thụt đỉnh), không có mặt đáy */
    solid(x0, y0, z0, x1, y1, z1, i0, i1, col) {
      const b = [
        [x0 + i0, y0, z0 + i0], [x1 - i0, y0, z0 + i0], [x1 - i0, y0, z1 - i0], [x0 + i0, y0, z1 - i0],
      ];
      const t = [
        [x0 + i1, y1, z0 + i1], [x1 - i1, y1, z0 + i1], [x1 - i1, y1, z1 - i1], [x0 + i1, y1, z1 - i1],
      ];
      const ctr = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      for (let k = 0; k < 4; k++) this.quad(b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k], col, ctr);
      this.quad(t[0], t[1], t[2], t[3], col, ctr);
    }
    /** Nhãn chữ trên mặt phím (quad phẳng, UV theo atlas) */
    label(cx, cy, cz, s, f, r, gi, col) {
      const N = 8;
      const cu = gi % N;
      const cv = Math.floor(gi / N);
      const u0 = cu / N, u1 = (cu + 1) / N;
      const v1 = 1 - cv / N, v0 = 1 - (cv + 1) / N;
      const pts = [
        [cx - r[0] * s - f[0] * s, cy, cz - r[1] * s - f[1] * s, u0, v0],
        [cx + r[0] * s - f[0] * s, cy, cz + r[1] * s - f[1] * s, u1, v0],
        [cx + r[0] * s + f[0] * s, cy, cz + r[1] * s + f[1] * s, u1, v1],
        [cx - r[0] * s + f[0] * s, cy, cz - r[1] * s + f[1] * s, u0, v1],
      ];
      const v0i = this.v;
      pts.forEach((q) => {
        this.p.push(q[0], q[1], q[2]);
        this.n.push(0, 1, 0);
        this.c.push(col.r, col.g, col.b);
        this.u.push(q[3], q[4]);
      });
      this.i.push(v0i, v0i + 1, v0i + 2, v0i, v0i + 2, v0i + 3);
      this.v += 4;
    }
    geometry(withUV) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
      if (withUV) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.i), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }

  // ============================================================ Atlas chữ trên phím
  const GLYPHS = [...'QWERTYUIOPASDFGHJKLZXCVBNM1234567890'].concat(['Tab', 'Alt', 'Fn', 'Esc', 'Shift', 'Enter', 'Caps', 'Ctrl', '⌫', 'WIN', '+1', '←', '↑', '↓', '→', '~', '!', '?', '$', 'SHOP', 'REB']);
  function makeAtlas() {
    const N = 8;
    const C = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * C;
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    const idx = {};
    GLYPHS.forEach((s, i) => {
      idx[s] = i;
      const cx = (i % N) * C + C / 2;
      const cy = Math.floor(i / N) * C + C / 2 + 2;
      let size = s.length === 1 ? 50 : 34;
      g.font = `800 ${size}px ${SKE.FONT}`;
      const w = g.measureText(s).width;
      if (w > C - 8) {
        size = (size * (C - 8)) / w;
        g.font = `800 ${size}px ${SKE.FONT}`;
      }
      g.fillText(s, cx, cy);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { tex, idx, canvas: cv };
  }

  // ============================================================ Lưới va chạm
  class Grid {
    constructor(cs) {
      this.cs = cs;
      this.m = new Map();
      this.stamp = 0;
    }
    k(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }
    add(b) {
      const cs = this.cs;
      for (let ix = Math.floor(b.x0 / cs); ix <= Math.floor(b.x1 / cs); ix++) {
        for (let iz = Math.floor(b.z0 / cs); iz <= Math.floor(b.z1 / cs); iz++) {
          const key = this.k(ix, iz);
          let l = this.m.get(key);
          if (!l) { l = []; this.m.set(key, l); }
          l.push(b);
        }
      }
    }
    query(x0, z0, x1, z1, out) {
      const cs = this.cs;
      this.stamp++;
      for (let ix = Math.floor(x0 / cs); ix <= Math.floor(x1 / cs); ix++) {
        for (let iz = Math.floor(z0 / cs); iz <= Math.floor(z1 / cs); iz++) {
          const l = this.m.get(this.k(ix, iz));
          if (!l) continue;
          for (let i = 0; i < l.length; i++) {
            const b = l[i];
            if (b.stamp !== this.stamp) { b.stamp = this.stamp; out.push(b); }
          }
        }
      }
    }
  }

  // ============================================================ Builder cho 1 stage
  const LETTERS = [...'QWERTYUIOPASDFGHJKLZXCVBNM'];
  const W15 = ['Tab', 'Alt', 'Fn', 'Esc'];
  const W2 = ['Shift', 'Enter', 'Caps', 'Ctrl', '⌫'];

  class Builder {
    constructor(world, sIdx, pal, start, seed) {
      this.w = world;
      this.s = sIdx;
      this.pal = pal;
      this.rng = U.rng(seed);
      this.x = start.x;
      this.y = start.y;
      this.z = start.z;
      this.head = 'N';
      this.hd = HEAD.N;
      this.plain = new GB();
      this.labels = new GB();
      this.boxes = [];
      this.group = new THREE.Group();
      this.bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      this.detourSign = 1;
      this.ents = [];
      this.capColors = pal.caps.map((h) => new THREE.Color(h));
      this.deckColor = new THREE.Color(pal.deck);
      this.lastCols = 3;
      this.path = [];
    }
    mark(type, u, v, extra) {
      const p = this.pt(u, v);
      this.path.push(Object.assign({ t: type, x: p[0], y: this.y, z: p[1], hx: this.hd.f[0], hz: this.hd.f[1] }, extra || {}));
    }
    pt(u, v) {
      const h = this.hd;
      return [this.x + h.f[0] * u + h.r[0] * v, this.z + h.f[1] * u + h.r[1] * v];
    }
    rect(u0, u1, v0, v1) {
      const a = this.pt(u0, v0);
      const b = this.pt(u1, v1);
      return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
    }
    advance(L) {
      this.x += this.hd.f[0] * L;
      this.z += this.hd.f[1] * L;
    }
    capColor() {
      const c = this.capColors[(this.rng() * this.capColors.length) | 0].clone();
      c.offsetHSL(0, 0, (this.rng() - 0.5) * 0.1);
      return c;
    }
    labelFor(w) {
      if (w >= 1.9) return W2[(this.rng() * W2.length) | 0];
      if (w >= 1.4) return W15[(this.rng() * W15.length) | 0];
      return LETTERS[(this.rng() * LETTERS.length) | 0];
    }
    partition(total) {
      const out = [];
      let r = total;
      while (r > 1e-6) {
        const opts = [1, 1, 1, 1, 1.5, 2].filter((w) => w <= r + 1e-6 && (r - w < 1e-6 || r - w >= 1 - 1e-6));
        const w = opts.length ? opts[(this.rng() * opts.length) | 0] : r;
        out.push(w);
        r -= w;
      }
      return out;
    }
    grow(r) {
      this.bb.x0 = Math.min(this.bb.x0, r.x0);
      this.bb.x1 = Math.max(this.bb.x1, r.x1);
      this.bb.z0 = Math.min(this.bb.z0, r.z0);
      this.bb.z1 = Math.max(this.bb.z1, r.z1);
    }
    /** Thêm 1 phím tĩnh (có va chạm). u/v là toạ độ cục bộ theo hướng đi. */
    addKey(u0, u1, v0, v1, o) {
      o = o || {};
      const r = this.rect(u0, u1, v0, v1);
      const top = this.y + (o.dy || 0);
      const height = o.height || KH;
      const bot = top - height;
      const cap = o.cap || this.capColor();
      const side = cap.clone().multiplyScalar(0.7);
      const ps = this.plain.v;
      this.plain.solid(r.x0, bot, r.z0, r.x1, top - CAPH, r.z1, 0, 0, side);
      this.plain.solid(r.x0, top - CAPH, r.z0, r.x1, top, r.z1, 0.1, o.inset != null ? o.inset : 0.32, cap);
      const pe = this.plain.v;
      let lr = null;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      if (o.label) {
        const gi = this.w.atlas.idx[o.label];
        if (gi != null) {
          const ls = this.labels.v;
          const s = o.labelSize || (o.label.length > 1 ? 1.25 : 1.0);
          this.labels.label(cx, top + 0.03, cz, s, this.hd.f, this.hd.r, gi, cap.clone().multiplyScalar(0.45));
          lr = [ls, this.labels.v];
        }
      }
      const box = {
        x0: r.x0, y0: bot, z0: r.z0, x1: r.x1, y1: top, z1: r.z1,
        kind: o.kind || 'key', label: o.label || null, stage: this.s, pr: [ps, pe], lr, active: true, stamp: 0,
        ck: o.ck || null, pad: o.pad || null,
      };
      this.w.addStatic(box);
      this.boxes.push(box);
      this.grow(r);
      return box;
    }
    /** Hộp đế (trang trí, không va chạm) */
    deck(u0, u1, v0, v1) {
      const r = this.rect(u0, u1, v0, v1);
      const m = 0.4;
      this.plain.solid(r.x0 - m, this.y - KH - 0.7, r.z0 - m, r.x1 + m, this.y - 1.05, r.z1 + m, 0.3, 0, this.deckColor);
    }
    /** Mesh phím động (sàn di động / cầu biến mất) */
    keyMesh(w, d, cap, label) {
      const gb = new GB();
      const lg = new GB();
      const side = cap.clone().multiplyScalar(0.7);
      gb.solid(-w / 2, -KH, -d / 2, w / 2, -CAPH, d / 2, 0, 0, side);
      gb.solid(-w / 2, -CAPH, -d / 2, w / 2, 0, d / 2, 0.1, 0.32, cap);
      const grp = new THREE.Group();
      const m = new THREE.Mesh(gb.geometry(), this.w.plainMat);
      m.castShadow = true;
      m.receiveShadow = true;
      grp.add(m);
      if (label && this.w.atlas.idx[label] != null) {
        // dựng theo hệ trục N rồi xoay cả mesh theo hướng đi (xem vanish/mover)
        lg.label(0, 0.03, 0, label.length > 1 ? 1.25 : 1.0, HEAD.N.f, HEAD.N.r, this.w.atlas.idx[label], cap.clone().multiplyScalar(0.45));
        const lm = new THREE.Mesh(lg.geometry(true), this.w.labelMat);
        lm.receiveShadow = true;
        grp.add(lm);
      }
      return grp;
    }

    // ---------------------------------------------------------------- chunks
    strip(L, cols, o) {
      o = o || {};
      const rows = Math.max(1, Math.round(L / KP));
      const W = cols * KP;
      this.lastCols = cols;
      for (let r = 0; r < rows; r++) {
        let v = -W / 2;
        const ws = this.partition(cols);
        ws.forEach((w) => {
          const cell = w * KP;
          const ck = o.ck && r === 0 ? o.ck : null;
          this.addKey(r * KP + KG / 2, (r + 1) * KP - KG / 2, v + KG / 2, v + cell - KG / 2, { label: this.labelFor(w), ck, cap: o.cap ? o.cap() : null });
          v += cell;
        });
      }
      this.deck(0, rows * KP, -W / 2, W / 2);
      this.mark('walk', Math.min(KP * 0.5, rows * KP - KG / 2), 0);
      if (!o.noEnd) this.mark('walk', rows * KP - KG / 2 - 0.4, 0);
      if (o.ck) {
        const c = this.pt(KP * 0.5, 0);
        o.ck.x = c[0]; o.ck.y = this.y + 0.1; o.ck.z = c[1]; o.ck.yaw = this.hd.yaw;
        this.flag(this.pt(KP * 0.5, -W / 2 - 0.9), o.ck);
      }
      this.advance(rows * KP);
    }
    gapCell(G) {
      this.mark('jump', -KG / 2, 0);
      this.advance(Math.max(0.5, G - KG));
    }
    flag(pos, ck) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 7, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
      pole.position.y = 3.5;
      pole.castShadow = true;
      g.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ color: this.pal.accent, side: THREE.DoubleSide, roughness: 0.6 }));
      cloth.position.set(1.4, 6.1, 0);
      g.add(cloth);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb703', emissiveIntensity: 0.4 }));
      ball.position.y = 7.1;
      g.add(ball);
      g.position.set(pos[0], this.y, pos[1]);
      this.group.add(g);
      ck.flagMesh = cloth;
    }
    plaza() {
      const cols = 9;
      const rows = 6;
      const W = cols * KP;
      const lanes = [1, 4, 7];
      const ck = { stage: this.s, plaza: true, x: 0, y: 0, z: 0, yaw: 0 };
      const segs = [[0, 1], [2, 2], [5, 2], [8, 1]]; // [col bắt đầu, số cột] giữa các làn treadmill
      for (let r = 0; r < rows; r++) {
        const tread = r >= 1 && r <= 4;
        const parts = tread ? segs : [[0, cols]];
        parts.forEach(([c0, n]) => {
          let v = -W / 2 + c0 * KP;
          this.partition(n).forEach((w) => {
            const cell = w * KP;
            this.addKey(r * KP + KG / 2, (r + 1) * KP - KG / 2, v + KG / 2, v + cell - KG / 2, { label: this.labelFor(w), ck: r === 0 ? ck : null });
            v += cell;
          });
        });
      }
      // treadmill
      lanes.forEach((c) => {
        const v0 = -W / 2 + c * KP + KG / 2;
        const v1 = v0 + KU;
        const u0 = 1 * KP + KG / 2;
        const u1 = 5 * KP - KG / 2;
        const box = this.addKey(u0, u1, v0, v1, { kind: 'treadmill', cap: new THREE.Color('#2a2a33'), label: null, inset: 0 });
        box.belt = true;
        const r = this.rect(u0, u1, v0, v1);
        this.w.addBelt(this.group, r, this.y);
      });
      this.deck(0, rows * KP, -W / 2, W / 2);
      const c = this.pt(KP * 0.5, 0);
      ck.x = c[0]; ck.y = this.y + 0.1; ck.z = c[1]; ck.yaw = this.hd.yaw;
      this.flag(this.pt(KP * 0.5, -W / 2 - 1.2), ck);
      this.flag(this.pt(KP * 0.5, W / 2 + 1.2), ck);
      // biển hiệu stage + treadmill
      const st = D.STAGES[this.s];
      if (st) {
        const mid = this.pt(KP * 5.4, 0);
        this.w.sprite(this.group, [`STAGE ${this.s + 1}`, st.name.toUpperCase(), `Win +${U.fmt(st.wins)}  •  Rec. Speed ${U.fmt(st.rec)}`],
          { w: 30, h: 9.4, x: mid[0], y: this.y + 16, z: mid[1], tw: 1024, th: 320, fills: ['#ffffff', st.accent, '#ffffff'], sizes: [60, 110, 56] });
      }
      this.w.treadSign(this.group, this.pt(KP * 3, 0), this.y + 5.2);
      this.w.plazaCk[this.s] = ck;
      this.advance(rows * KP);
      return ck;
    }
    stones(n, sz, jit) {
      const size = sz * KP;
      for (let i = 0; i < n; i++) {
        this.gapCell(this.gap());
        const off = (this.rng() * 2 - 1) * jit;
        this.addKey(KG / 2, size - KG / 2, -size / 2 + KG / 2 + off, size / 2 - KG / 2 + off, { label: this.labelFor(sz) });
        this.mark('walk', size / 2, off);
        this.advance(size);
      }
      this.gapCell(this.gap());
    }
    gap() {
      return D.STAGES[this.s] ? D.STAGES[this.s].gap : 5;
    }
    vanish(n, cols) {
      const W = cols * KP;
      for (let i = 0; i < n; i++) {
        const cap = this.capColor();
        const w = W - KG;
        const d = KU;
        const label = this.labelFor(1);
        const mesh = this.keyMesh(w, d, cap, label);
        const c = this.pt(KP / 2, 0);
        mesh.position.set(c[0], this.y, c[1]);
        mesh.rotation.y = this.hd.yaw;
        const r = this.rect(KG / 2, KP - KG / 2, -W / 2 + KG / 2, W / 2 - KG / 2);
        const box = { x0: r.x0, y0: this.y - KH, z0: r.z0, x1: r.x1, y1: this.y, z1: r.z1, kind: 'vanish', stage: this.s, active: true, stamp: 0, dyn: true };
        this.group.add(mesh);
        const ent = new E.Vanisher(mesh, box, SKE.audio);
        ent.delay = Math.max(0.45, 0.8 - this.s * 0.03);
        box.owner = ent;
        this.w.dyn.push(box);
        this.w.vanishers.push(ent);
        this.ents.push(ent);
        this.grow(r);
        this.mark('walk', KP / 2, 0);
        this.advance(KP);
      }
    }
    mover(cols, spanMul) {
      const G = Math.round(this.gap() * (spanMul || 1.7));
      const w = cols * KP - KG;
      const d = KU * (this.s >= 11 ? 2.8 : this.s >= 8 ? 2.2 : this.s >= 4 ? 1.7 : 1); // sàn to dần vì quán tính ở Speed cao
      const near = 0.05 + d / 2;
      const far = G - 0.05 - d / 2;
      const a = this.pt(near, 0);
      const b = this.pt(far, 0);
      const cap = this.capColor();
      const mesh = this.keyMesh(w, d, cap, this.labelFor(2));
      mesh.rotation.y = this.hd.yaw;
      mesh.position.set(a[0], this.y, a[1]);
      const hw = this.head === 'N' ? w / 2 : d / 2;
      const hd2 = this.head === 'N' ? d / 2 : w / 2;
      const box = { x0: a[0] - hw, x1: a[0] + hw, z0: a[1] - hd2, z1: a[1] + hd2, y0: this.y - KH, y1: this.y, kind: 'mover', stage: this.s, active: true, stamp: 0, dyn: true, dx: 0, dz: 0 };
      this.group.add(mesh);
      const speed = 5.5 + this.s * 0.9;
      const period = (2 * Math.abs(far - near)) / speed;
      const ent = new E.Mover(mesh, box, { x: a[0], z: a[1] }, { x: b[0], z: b[1] }, period, this.rng());
      box.owner = ent;
      this.w.dyn.push(box);
      this.w.movers.push(ent);
      this.ents.push(ent);
      this.grow({ x0: Math.min(a[0], b[0]) - hw, x1: Math.max(a[0], b[0]) + hw, z0: Math.min(a[1], b[1]) - hd2, z1: Math.max(a[1], b[1]) + hd2 });
      this.path.push({ t: 'ride', ent, near: this.pt(-0.4, 0), far: this.pt(G + 0.4, 0), travel: far - near, y: this.y, x: a[0], z: a[1], hx: this.hd.f[0], hz: this.hd.f[1] });
      this.advance(G);
    }
    spinner(cols, rows, count) {
      const L = rows * KP;
      this.strip(L, cols);
      const half = (cols * KP) / 2 - 0.5;
      for (let i = 0; i < count; i++) {
        const u = L * ((i + 1) / (count + 1));
        const c = this.pt(u - L, 0); // strip đã advance => lùi lại
        const sp = new E.Spinner(this.group, c[0], this.y, c[1], half, (1.5 + this.s * 0.1) * (i % 2 ? -1 : 1), this.pal.accent);
        this.w.spinners.push(sp);
        this.ents.push(sp);
      }
    }
    brainrot(cols, rows, count, chase) {
      const L = rows * KP;
      const W = cols * KP;
      this.strip(L, cols);
      const h = this.hd;
      for (let i = 0; i < count; i++) {
        const u = L * ((i + 0.6) / (count + 0.2)) - L;
        const c = this.pt(u, 0);
        const bo = new E.Brainrot(this.group, { x: c[0], y: this.y, z: c[1] }, { x: h.r[0], z: h.r[1] }, W / 2 - 1.8, L / 2 - 1.4, 4.5 + this.s * 0.55, (this.s + i) % 3, chase, this.rng());
        this.w.brainrots.push(bo);
        this.ents.push(bo);
      }
    }
    laser(rows) {
      const cols = 6;
      const L = rows * KP;
      const W = cols * KP;
      this.strip(L, cols);
      const covers = [];
      const nCov = Math.max(3, rows - 3);
      for (let i = 0; i < nCov; i++) {
        const u = L * ((i + 1) / (nCov + 1)) - L;
        const v = (i % 2 ? 1 : -1) * W * 0.18 * (1 + ((i * 7) % 3) * 0.25);
        const r = this.rect(u - KU / 2, u + KU / 2, v - KU / 2, v + KU / 2);
        const bot = this.y;
        const top = this.y + 5.2;
        const cap = new THREE.Color(this.pal.accent);
        const side = cap.clone().multiplyScalar(0.7);
        const ps = this.plain.v;
        this.plain.solid(r.x0, bot, r.z0, r.x1, top - CAPH, r.z1, 0, 0, side);
        this.plain.solid(r.x0, top - CAPH, r.z0, r.x1, top, r.z1, 0.1, 0.4, cap);
        const box = { x0: r.x0, y0: bot - 0.1, z0: r.z0, x1: r.x1, y1: top, z1: r.z1, kind: 'cover', stage: this.s, active: true, stamp: 0, pr: null, lr: null };
        void ps;
        this.w.addStatic(box);
        this.boxes.push(box);
        covers.push(box);
      }
      // trụ laser đặt ở rìa cuối đoạn, hướng ngược lại
      const side = this.s % 2 ? 1 : -1;
      const p = this.pt(0, side * (W / 2 + 3.2));
      const target = this.pt(-L * 0.45, 0);
      const baseYaw = Math.atan2(target[0] - p[0], target[1] - p[1]);
      const range = Math.hypot(L, W / 2 + 3.5) * 1.08; // phủ hết dải hành lang
      const lz = new E.Laser(this.group, { x: p[0], y: this.y - 3, z: p[1] }, baseYaw, 0.55, 0.9, range, covers, this.rng() * 6);
      lz.eyeH = 9.5;
      lz.head.position.y = lz.eyeH;
      lz.wedge.position.y = 3.06; // trụ đặt thấp hơn mặt phím 3 đơn vị => nâng vùng quét lên mặt sàn
      this.w.lasers.push(lz);
      this.ents.push(lz);
    }
    corner() {
      const cols = this.lastCols;
      const W = cols * KP;
      this.strip(W, cols, { noEnd: true });
      this.mark('walk', -W / 2, 0);
      const f = this.hd.f;
      const cxm = this.x - f[0] * (W / 2);
      const czm = this.z - f[1] * (W / 2);
      if (this.head === 'N') {
        this.head = this.detourSign > 0 ? 'E' : 'W';
        this.detourSign = -this.detourSign;
      } else {
        this.head = 'N';
      }
      this.hd = HEAD[this.head];
      this.x = cxm + this.hd.f[0] * (W / 2);
      this.z = czm + this.hd.f[1] * (W / 2);
    }
    win() {
      const st = D.STAGES[this.s];
      const cols = 5;
      const rows = 3;
      const W = cols * KP - KG;
      const Ld = rows * KP - KG;
      const cap = new THREE.Color('#ffd93d');
      const box = this.addKey(KG / 2, KG / 2 + Ld, -W / 2, W / 2, { kind: 'win', cap, label: 'WIN', labelSize: 4.6, inset: 0.6 });
      this.deck(0, Ld + KG, -W / 2 - KG / 2, W / 2 + KG / 2);
      const c = this.pt(KG / 2 + Ld / 2, 0);
      this.w.stages[this.s].win = { x: c[0], y: this.y, z: c[1], box };
      this.mark('walk', KG / 2 + Ld / 2, 0, { win: true });
      // cột sáng + biển
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(7.5, 7.5, 34, 28, 1, true),
        new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
      );
      beam.position.set(c[0], this.y + 17, c[1]);
      this.group.add(beam);
      this.w.beams.push(beam);
      this.w.sprite(this.group, [`+${U.fmt(st.wins)} WINS`, `Stage ${this.s + 1} Clear!`], { w: 15, h: 5.5, x: c[0], y: this.y + 8.5, z: c[1], tw: 768, th: 280, fills: ['#ffe066', '#ffffff'], sizes: [130, 70] });
      this.advance(Ld + KG);
    }

    // ---------------------------------------------------------------- chương trình stage
    run(prog) {
      for (const t of prog) {
        switch (t[0]) {
          case 'plaza': this.plaza(); break;
          case 'strip': this.strip(t[1], t[2], t[3]); break;
          case 'jump': this.gapCell(this.gap()); break;
          case 'stones': this.stones(t[1], t[2] || 1, t[3] || 0.6); break;
          case 'vanish': this.vanish(t[1], t[2] || 2); break;
          case 'mover': this.mover(t[1] || 2, t[2]); break;
          case 'spinner': this.spinner(t[1], t[2], t[3]); break;
          case 'brainrot': this.brainrot(t[1], t[2], t[3], t[4]); break;
          case 'laser': this.laser(t[1]); break;
          case 'corner': this.corner(); break;
          case 'win': this.win(); break;
          default:
        }
      }
    }
    finish() {
      const w = this.w;
      const pg = this.plain.geometry();
      const lg = this.labels.geometry(true);
      const pm = new THREE.Mesh(pg, w.plainMat);
      pm.castShadow = true;
      pm.receiveShadow = true;
      this.group.add(pm);
      const lm = new THREE.Mesh(lg, w.labelMat);
      lm.receiveShadow = true;
      this.group.add(lm);
      const sm = { plain: pg, labels: lg, basePlain: new Float32Array(pg.attributes.position.array), baseLabels: new Float32Array(lg.attributes.position.array) };
      this.boxes.forEach((b) => { b.sm = sm; });
      if (w.stages[this.s]) w.stages[this.s].path = this.path;
      w.root.add(this.group);
      return this;
    }
  }

  // ============================================================ chương trình theo stage
  function makeProgram(s) {
    const rng = U.rng(9100 + s * 31);
    const t = [['plaza']];
    const cols = s >= 8 ? 4 : 3;
    const landing = Math.round(8 + s * 1.2);
    t.push(['strip', 12, cols]);
    const pool = ['stones', 'jump'];
    if (s >= 1) pool.push('vanish');
    if (s >= 2) pool.push('mover');
    if (s >= 3) { pool.push('spinner'); pool.push('brainrot'); }
    if (s >= 4) pool.push('narrow');
    if (s >= 7) pool.push('laser');
    if (s === 0) pool.push('narrow');
    let useful = pool.slice();
    if (s === 9) useful = ['brainrot', 'laser', 'brainrot', 'stones', 'vanish', 'laser'];
    const count = 5 + Math.floor(s * 0.6);
    let last = '';
    const ckAt = [Math.floor(count / 2) - 1, count - 3];
    for (let i = 0; i < count; i++) {
      let ty;
      let guard = 0;
      do { ty = useful[(rng() * useful.length) | 0]; guard++; } while (ty === last && guard < 8);
      last = ty;
      switch (ty) {
        case 'stones': t.push(['stones', 3 + Math.floor(s / 3), 1, 0.7]); break;
        case 'jump': t.push(['jump']); break;
        case 'vanish': t.push(['vanish', 5 + Math.floor(s / 2), cols]); break;
        case 'mover': t.push(['mover', 2]); break;
        case 'spinner': t.push(['spinner', cols + 1, 5, 2 + (s >= 8 ? 1 : 0)]); break;
        case 'brainrot': t.push(['brainrot', cols + 2, 6, 2 + Math.floor(s / 4), s >= 4]); break;
        case 'narrow': t.push(['strip', KP * (4 + Math.floor(s / 2)), s === 0 ? 2 : 1]); break;
        case 'laser': t.push(['laser', 10]); break;
        default:
      }
      const ck = ckAt.indexOf(i) >= 0 ? { stage: s, plaza: false } : null;
      t.push(['strip', landing, cols, ck ? { ck } : undefined]);
      if (i === 1 || i === count - 3) { t.push(['corner']); t.push(['strip', KP * 5, cols]); t.push(['corner']); t.push(['strip', KP * 2, cols]); }
    }
    t.push(['strip', 10, cols], ['win']);
    return t;
  }

  const LOBBY_PAL = { caps: ['#ff9ec7', '#8be0a4', '#ffd36e', '#9ad7ff', '#d9b8ff'], deck: '#5b3426', accent: '#ff6fa5' };

  // ============================================================ World
  class World {
    constructor(scene) {
      this.scene = scene;
      this.root = new THREE.Group();
      scene.add(this.root);
      this.grid = new Grid(12);
      this.dyn = [];
      this.stages = [];
      this.plazaCk = [];
      this.movers = [];
      this.vanishers = [];
      this.spinners = [];
      this.brainrots = [];
      this.lasers = [];
      this.beams = [];
      this.belts = [];
      this.treadSigns = [];
      this.groups = [];
      this.pads = [];
      this.presses = [];
      this.tmpBoxes = [];
      this.atlas = makeAtlas();
      this.plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.02 });
      this.labelMat = new THREE.MeshLambertMaterial({
        map: this.atlas.tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      this.beltTex = this.makeBeltTexture();
      this.beltMat = new THREE.MeshStandardMaterial({ map: this.beltTex, color: '#6b4226', roughness: 0.7 });
      this.railMat = new THREE.MeshStandardMaterial({ color: '#c98b5a', emissive: '#c98b5a', emissiveIntensity: 0.6 });
      this.treadTier = 0;
      this.killY = KILL_Y;
      this.seaY = SEA_Y;
      this.build();
    }
    makeBeltTexture() {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#9d9d9d';
      g.fillRect(0, 0, 64, 128);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 0; i < 2; i++) {
        const y = 22 + i * 64;
        g.beginPath();
        g.moveTo(10, y + 22);
        g.lineTo(32, y);
        g.lineTo(54, y + 22);
        g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    addStatic(b) {
      this.grid.add(b);
    }
    addBelt(group, r, y) {
      const w = r.x1 - r.x0;
      const l = r.z1 - r.z0;
      const geo = new THREE.BoxGeometry(w, 0.5, l);
      const tex = this.beltTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, l / 6.4);
      const mat = this.beltMat.clone();
      mat.map = tex;
      const m = new THREE.Mesh(geo, mat);
      m.position.set((r.x0 + r.x1) / 2, y - 0.23, (r.z0 + r.z1) / 2);
      m.receiveShadow = true;
      group.add(m);
      this.belts.push({ tex, mat });
      [-1, 1].forEach((s) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, l), this.railMat);
        rail.position.set((r.x0 + r.x1) / 2 + s * (w / 2 - 0.14), y + 0.02, (r.z0 + r.z1) / 2);
        group.add(rail);
      });
    }
    sprite(group, lines, o) {
      const tex = U.textTexture(lines, { w: o.tw || 512, h: o.th || 160, fills: o.fills, sizes: o.sizes });
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.scale.set(o.w, o.h, 1);
      s.position.set(o.x, o.y, o.z);
      group.add(s);
      return s;
    }
    treadSign(group, pos, y) {
      const s = this.sprite(group, ['TREADMILL', '×1'], { w: 11, h: 3.8, x: pos[0], y, z: pos[1], tw: 512, th: 176, fills: ['#ffffff', '#ffe066'], sizes: [64, 78] });
      this.treadSigns.push(s);
    }
    setTreadmillTier(i) {
      const t = D.TREADMILLS[i];
      this.treadTier = i;
      this.beltMat.color.set(t.color);
      this.railMat.color.set(t.glow);
      this.railMat.emissive.set(t.glow);
      this.belts.forEach((b) => b.mat.color.set(t.color));
      this.treadSigns.forEach((s) => {
        const old = s.material.map;
        s.material.map = U.textTexture(['TREADMILL', U.fmtMult(t.mult)], { w: 512, h: 176, fills: ['#ffffff', t.glow], sizes: [64, 78] });
        s.material.needsUpdate = true;
        if (old) old.dispose();
      });
    }

    // ------------------------------------------------------------ build
    build() {
      // Lobby
      const lb = new Builder(this, -1, LOBBY_PAL, { x: 0, y: 0, z: 0 }, 777);
      this.buildLobby(lb);
      lb.finish();
      this.groups.push(lb);
      this.lobby = lb;
      let z = lb.z;
      let first = true;
      D.STAGES.forEach((st, i) => {
        this.stages[i] = { index: i, name: st.name };
        const b = new Builder(this, i, st, { x: 0, y: 0, z: first ? z : z - 36 }, 4242 + i * 17);
        first = false;
        b.run(makeProgram(i));
        b.finish();
        this.stages[i].ck = this.plazaCk[i];
        this.stages[i].bb = b.bb;
        this.groups.push(b);
        this.buildDecor(b, i);
        z = b.z; // stage kế tiếp bắt đầu sau stage này (cách 36 đơn vị)
      });
      // biển chocolate bên dưới (rơi xuống là respawn)
      this.sea = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        new THREE.MeshStandardMaterial({ color: '#5a3320', roughness: 0.18, metalness: 0.25 })
      );
      this.sea.rotation.x = -Math.PI / 2;
      this.sea.position.y = SEA_Y;
      this.sea.receiveShadow = false;
      this.scene.add(this.sea);
      this.setTreadmillTier(0);
    }

    buildLobby(b) {
      // spawn area
      const cols = 9;
      const W = cols * KP;
      const ck = { stage: -1, plaza: true, lobby: true, x: 0, y: 0, z: 0, yaw: 0 };
      b.strip(2 * KP, cols, { ck });
      // hàng nút số (shop) — 2 pad đặc biệt + 7 phím số '2'..'8'
      const row = (n) => n * KP;
      const rowKeys = [
        { n: 'SHOP', pad: { type: 'shop' }, cap: '#ff6fa5' },
        { n: 'REB', pad: { type: 'rebirth' }, cap: '#b57bff' },
      ];
      for (let i = 1; i <= 7; i++) rowKeys.push({ n: String(i + 1), pad: { type: 'step', tier: i }, cap: '#ffe29a' });
      rowKeys.forEach((k, ci) => {
        const v0 = -W / 2 + ci * KP;
        const box = b.addKey(KG / 2, KP - KG / 2, v0 + KG / 2, v0 + KP - KG / 2, { label: k.n, cap: new THREE.Color(k.cap), kind: 'pad', pad: k.pad, labelSize: k.n.length > 1 ? 1.3 : 1.15 });
        const c = b.pt(KP / 2, -W / 2 + ci * KP + KP / 2);
        const sp = this.sprite(b.group, ['', ''], { w: 4.6, h: 2.05, x: c[0], y: b.y + 3.6, z: c[1], tw: 384, th: 170 });
        this.pads.push({ box, pad: k.pad, sprite: sp, x: c[0], z: c[1] });
      });
      b.deck(0, KP, -W / 2, W / 2);
      b.advance(KP);
      b.strip(KP, cols);
      // treadmill zone: dùng plaza() nhưng không có biển stage -> tạo thủ công
      const lanes = [1, 4, 7];
      const segs = [[0, 1], [2, 2], [5, 2], [8, 1]];
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const tread = r >= 1 && r <= 4;
        const parts = tread ? segs : [[0, cols]];
        parts.forEach(([c0, n]) => {
          let v = -W / 2 + c0 * KP;
          b.partition(n).forEach((w) => {
            const cell = w * KP;
            b.addKey(r * KP + KG / 2, (r + 1) * KP - KG / 2, v + KG / 2, v + cell - KG / 2, { label: b.labelFor(w) });
            v += cell;
          });
        });
      }
      lanes.forEach((c) => {
        const v0 = -W / 2 + c * KP + KG / 2;
        const v1 = v0 + KU;
        const u0 = KP + KG / 2;
        const u1 = 5 * KP - KG / 2;
        const box = b.addKey(u0, u1, v0, v1, { kind: 'treadmill', cap: new THREE.Color('#2a2a33'), label: null, inset: 0 });
        box.belt = true;
        this.addBelt(b.group, b.rect(u0, u1, v0, v1), b.y);
      });
      b.deck(0, rows * KP, -W / 2, W / 2);
      const tc = b.pt(KP * 3, 0);
      this.treadSign(b.group, tc, b.y + 6.5);
      b.advance(rows * KP);
      const sc = b.pt(KP * 3.5, 0);
      this.sprite(b.group, ['+1 SPEED', 'KEYBOARD ESCAPE', 'Chạy · Nhảy · Thoát khỏi bàn phím!'],
        { w: 34, h: 14.6, x: sc[0], y: b.y + 17, z: sc[1], tw: 1024, th: 440, fills: ['#ffe066', '#ffffff', '#ffd6f0'], sizes: [190, 120, 52], strokeColors: ['#7a2a00', '#6a1b9a', '#6a1b9a'] });
      b.strip(2 * KP, 3);
      b.strip(KP * 3, 3);
      const sp = ck;
      this.spawn = { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, stage: -1 };
      this.plazaCk[-1] = ck;
      this.lobbyCk = ck;
    }

    buildDecor(b, i) {
      const st = D.STAGES[i];
      const rng = U.rng(555 + i * 13);
      const boxes = b.boxes;
      if (!boxes.length) return;
      const geos = [
        new THREE.SphereGeometry(1, 14, 10),
        new THREE.TorusGeometry(1, 0.42, 10, 20),
        new THREE.ConeGeometry(1, 2.4, 12),
        new THREE.CapsuleGeometry(0.45, 2.2, 4, 8),
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
      ];
      const lists = geos.map(() => []);
      const cols = st.caps.map((h) => new THREE.Color(h));
      const count = 46;
      let guard = 0;
      while (lists.reduce((a, l) => a + l.length, 0) < count && guard++ < 500) {
        const k = boxes[(rng() * boxes.length) | 0];
        const ang = rng() * Math.PI * 2;
        const dist = 38 + rng() * 90;
        const x = (k.x0 + k.x1) / 2 + Math.cos(ang) * dist;
        const z = (k.z0 + k.z1) / 2 + Math.sin(ang) * dist;
        const y = -6 + rng() * 34 - (rng() < 0.3 ? 20 : 0);
        const near = [];
        this.grid.query(x - 30, z - 30, x + 30, z + 30, near);
        if (near.some((q) => y > q.y0 - 18 && y < q.y1 + 18 && x > q.x0 - 24 && x < q.x1 + 24 && z > q.z0 - 24 && z < q.z1 + 24)) continue;
        const kind = (rng() * geos.length) | 0;
        const s = 2.5 + rng() * 6;
        lists[kind].push({ x, y, z, s, c: cols[(rng() * cols.length) | 0], rx: rng() * 3, rz: rng() * 3 });
      }
      const dummy = new THREE.Object3D();
      geos.forEach((geo, gi) => {
        const l = lists[gi];
        if (!l.length) return;
        const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.0 }), l.length);
        l.forEach((it, idx) => {
          dummy.position.set(it.x, it.y, it.z);
          dummy.rotation.set(it.rx, it.rx * 0.7, it.rz);
          dummy.scale.setScalar(it.s);
          dummy.updateMatrix();
          m.setMatrixAt(idx, dummy.matrix);
          m.setColorAt(idx, it.c);
        });
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        b.group.add(m);
      });
    }

    // ------------------------------------------------------------ truy vấn / cập nhật
    query(x0, y0, z0, x1, y1, z1, out) {
      out.length = 0;
      this.grid.query(x0, z0, x1, z1, out);
      let n = 0;
      for (let i = 0; i < out.length; i++) {
        const b = out[i];
        if (b.y1 < y0 || b.y0 > y1) continue;
        out[n++] = b;
      }
      out.length = n;
      for (let i = 0; i < this.dyn.length; i++) {
        const b = this.dyn[i];
        if (!b.active) continue;
        if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1 || b.y1 < y0 || b.y0 > y1) continue;
        out.push(b);
      }
      return out;
    }

    press(box) {
      if (!box || !box.pr || !box.sm) return;
      for (let i = 0; i < this.presses.length; i++) {
        if (this.presses[i].box === box) { this.presses[i].t = 0; return; }
      }
      this.presses.push({ box, t: 0 });
    }

    applyPress(box, k) {
      const sm = box.sm;
      const off = -0.5 * k;
      const pa = sm.plain.attributes.position;
      for (let i = box.pr[0]; i < box.pr[1]; i++) pa.array[i * 3 + 1] = sm.basePlain[i * 3 + 1] + off;
      pa.needsUpdate = true;
      if (box.lr) {
        const la = sm.labels.attributes.position;
        for (let i = box.lr[0]; i < box.lr[1]; i++) la.array[i * 3 + 1] = sm.baseLabels[i * 3 + 1] + off;
        la.needsUpdate = true;
      }
    }

    /** Cập nhật thế giới. ctx: {player, audio, kill(reason)} */
    update(dt, t, ctx) {
      const p = ctx.player.pos;
      // belt scroll
      const sc = dt * 1.1;
      this.belts.forEach((b) => { b.tex.offset.y += sc; });
      // key press anim
      for (let i = this.presses.length - 1; i >= 0; i--) {
        const pr = this.presses[i];
        pr.t += dt;
        const down = 0.07;
        const up = 0.22;
        let k;
        if (pr.t < down) k = pr.t / down;
        else k = Math.max(0, 1 - (pr.t - down) / up);
        this.applyPress(pr.box, k);
        if (pr.t > down + up) this.presses.splice(i, 1);
      }
      // visibility theo khoảng cách
      this.groups.forEach((g) => {
        const bb = g.bb;
        const dx = Math.max(bb.x0 - p.x, 0, p.x - bb.x1);
        const dz = Math.max(bb.z0 - p.z, 0, p.z - bb.z1);
        g.dist = Math.hypot(dx, dz);
        g.group.visible = g.dist < 420;
      });
      const near = (e, r) => {
        const ex = e.x !== undefined ? e.x : e.pos ? e.pos.x : e.cx;
        const ez = e.z !== undefined ? e.z : e.pos ? e.pos.z : e.cz;
        return Math.abs(ex - p.x) < r && Math.abs(ez - p.z) < r;
      };
      for (let i = 0; i < this.movers.length; i++) this.movers[i].update(dt, t);
      for (let i = 0; i < this.vanishers.length; i++) this.vanishers[i].update(dt);
      for (let i = 0; i < this.spinners.length; i++) {
        const s = this.spinners[i];
        if (!near(s, 160)) continue;
        s.update(dt);
        if (!ctx.player.invuln && s.hit(p)) ctx.kill('spinner');
      }
      for (let i = 0; i < this.brainrots.length; i++) {
        const b = this.brainrots[i];
        if (!near(b, 160)) continue;
        b.update(dt, t, ctx);
        if (!ctx.player.invuln && b.hit(p)) ctx.kill('brainrot');
      }
      for (let i = 0; i < this.lasers.length; i++) {
        const l = this.lasers[i];
        if (!near(l, 200)) continue;
        l.update(dt, t, ctx);
      }
      for (let i = 0; i < this.beams.length; i++) this.beams[i].rotation.y += dt * 0.6;
      this.sea.position.x = p.x;
      this.sea.position.z = p.z;
      if (ctx.seaColor) this.sea.material.color.copy(ctx.seaColor);
      // checkpoint cờ nhấp nhô
      this.groups.forEach((g) => {
        if (g.group.visible) void g;
      });
    }

    refreshPads(state) {
      this.pads.forEach((pd) => {
        let lines;
        let fills;
        if (pd.pad.type === 'shop') { lines = ['SHOP', 'Trails • Auras']; fills = ['#ffffff', '#ffd6f0']; }
        else if (pd.pad.type === 'rebirth') { lines = ['REBIRTH', 'Reset ×Mult']; fills = ['#ffffff', '#e5d1ff']; }
        else {
          const st = D.STEPS[pd.pad.tier];
          const owned = state.stepTier >= pd.pad.tier;
          const next = state.stepTier + 1 === pd.pad.tier;
          lines = [`+${st.step} Step`, owned ? '✔ Owned' : `${U.fmt(st.wins)} Wins`];
          fills = ['#ffffff', owned ? '#8dffb0' : next ? '#ffe066' : '#c9c1d6'];
        }
        const old = pd.sprite.material.map;
        pd.sprite.material.map = U.textTexture(lines, { w: 384, h: 170, fills, sizes: [76, 62] });
        pd.sprite.material.needsUpdate = true;
        if (old) old.dispose();
      });
    }
  }

  SKE.World = World;
  SKE.WORLD_CONST = { KU, KG, KP, KH, SEA_Y, KILL_Y };
})();
