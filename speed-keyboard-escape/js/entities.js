/* Thực thể động: sàn di động, cầu biến mất, thanh quay, brainrot, laser */
(function () {
  'use strict';
  const SKE = window.SKE;
  const THREE = window.THREE;
  const U = SKE.util;
  const E = (SKE.entities = {});

  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.0 }, o || {}));

  // ------------------------------------------------------------------ Mover
  E.Mover = class {
    constructor(mesh, box, a, b, period, phase) {
      this.mesh = mesh;
      this.box = box;
      this.a = a;
      this.b = b;
      this.period = period;
      this.phase = phase || 0;
      this.hx = (box.x1 - box.x0) / 2;
      this.hz = (box.z1 - box.z0) / 2;
      this.cx = (a.x + b.x) / 2;
      this.cz = (a.z + b.z) / 2;
      this.update(0, 0);
    }
    update(dt, t) {
      const s = 0.5 - 0.5 * Math.cos((t / this.period + this.phase) * Math.PI * 2);
      const nx = this.a.x + (this.b.x - this.a.x) * s;
      const nz = this.a.z + (this.b.z - this.a.z) * s;
      this.box.dx = nx - this.cx;
      this.box.dz = nz - this.cz;
      this.cx = nx;
      this.cz = nz;
      this.box.x0 = nx - this.hx;
      this.box.x1 = nx + this.hx;
      this.box.z0 = nz - this.hz;
      this.box.z1 = nz + this.hz;
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
    }
  };

  // --------------------------------------------------------------- Vanisher
  E.Vanisher = class {
    constructor(mesh, box, audio) {
      this.mesh = mesh;
      this.box = box;
      this.audio = audio;
      this.state = 'idle';
      this.timer = 0;
      this.vy = 0;
      this.baseX = mesh.position.x;
      this.baseY = mesh.position.y;
      this.baseZ = mesh.position.z;
      this.delay = 0.7;
    }
    touch() {
      if (this.state === 'idle') {
        this.state = 'shake';
        this.timer = 0;
        this.audio.vanish();
      }
    }
    update(dt) {
      const m = this.mesh;
      this.timer += dt;
      switch (this.state) {
        case 'shake':
          m.position.x = this.baseX + (Math.random() - 0.5) * 0.18;
          m.position.z = this.baseZ + (Math.random() - 0.5) * 0.18;
          if (this.timer > this.delay) {
            this.state = 'fall';
            this.timer = 0;
            this.vy = 0;
            this.box.active = false;
            m.position.x = this.baseX;
            m.position.z = this.baseZ;
          }
          break;
        case 'fall':
          this.vy += 40 * dt;
          m.position.y -= this.vy * dt;
          m.scale.setScalar(Math.max(0.01, 1 - this.timer * 0.8));
          if (this.timer > 1.1) {
            this.state = 'hidden';
            this.timer = 0;
            m.visible = false;
          }
          break;
        case 'hidden':
          if (this.timer > 2.4) {
            this.state = 'return';
            this.timer = 0;
            m.visible = true;
            m.position.y = this.baseY;
            m.scale.setScalar(0.01);
          }
          break;
        case 'return': {
          const k = Math.min(1, this.timer / 0.25);
          m.scale.setScalar(Math.max(0.01, k));
          if (k >= 1) {
            this.state = 'idle';
            this.box.active = true;
            m.scale.setScalar(1);
          }
          break;
        }
        default:
      }
    }
  };

  // ---------------------------------------------------------------- Spinner
  E.Spinner = class {
    constructor(scene, x, y, z, halfLen, speed, color) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.L = halfLen;
      this.speed = speed;
      this.ang = Math.random() * Math.PI * 2;
      const g = (this.group = new THREE.Group());
      g.position.set(x, y, z);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 16), mat('#ffffff'));
      pillar.position.y = 0.5;
      pillar.castShadow = true;
      g.add(pillar);
      this.bar = new THREE.Group();
      // thanh sọc kẹo
      const segs = 7;
      const len = (halfLen * 2) / segs;
      for (let i = 0; i < segs; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 12), mat(i % 2 ? '#ffffff' : color));
        m.rotation.z = Math.PI / 2;
        m.position.set(-halfLen + len * (i + 0.5), 0.8, 0);
        m.castShadow = true;
        this.bar.add(m);
      }
      [-1, 1].forEach((s) => {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), mat(color));
        ball.position.set(s * halfLen, 0.8, 0);
        ball.castShadow = true;
        this.bar.add(ball);
      });
      g.add(this.bar);
      scene.add(g);
    }
    update(dt) {
      this.ang += this.speed * dt;
      this.bar.rotation.y = this.ang;
    }
    hit(p) {
      if (p.y > this.y + 1.45 || p.y + 2.1 < this.y + 0.3) return false;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const ux = Math.cos(this.ang);
      const uz = -Math.sin(this.ang);
      const t = U.clamp(dx * ux + dz * uz, -this.L, this.L);
      const px = ux * t - dx;
      const pz = uz * t - dz;
      return px * px + pz * pz < 0.85 * 0.85;
    }
  };

  // -------------------------------------------------------------- Brainrot
  const STYLE_COLORS = ['#ff4fd8', '#39ff88', '#ffb703', '#4dd2ff'];

  function buildBrainrot(style, color) {
    const g = new THREE.Group();
    const body = mat(color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.15 });
    const white = mat('#ffffff', { roughness: 0.2 });
    const black = mat('#15121c', { roughness: 0.3 });
    const parts = { legs: [], arms: [] };
    let eyeY = 1.9;
    let eyeZ = 0.7;
    let eyeX = 0.42;
    if (style === 0) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14), body);
      b.scale.set(1, 1.08, 1);
      b.position.y = 1.35;
      g.add(b);
      parts.body = b;
      eyeY = 1.9;
      eyeZ = 0.95;
    } else if (style === 1) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 1.5, 6, 14), body);
      b.position.y = 1.7;
      g.add(b);
      parts.body = b;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 12), mat('#ff3d71'));
      hat.position.y = 3.15;
      g.add(hat);
      eyeY = 2.3;
      eyeZ = 0.62;
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.7, 1.8), body);
      b.position.y = 1.35;
      g.add(b);
      parts.body = b;
      [-0.55, 0.55].forEach((x) => {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), black);
        st.position.set(x, 2.45, 0.3);
        g.add(st);
      });
      eyeY = 2.85;
      eyeZ = 0.3;
      eyeX = 0.55;
    }
    // mắt
    parts.pupils = [];
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), white);
      eye.position.set(s * eyeX, eyeY, eyeZ);
      g.add(eye);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), black);
      pu.position.set(s * eyeX, eyeY, eyeZ + 0.3);
      g.add(pu);
      parts.pupils.push(pu);
    });
    // miệng + răng
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.2), black);
    mouth.position.set(0, eyeY - 0.75, eyeZ + (style === 0 ? 0.05 : 0.15));
    g.add(mouth);
    for (let i = -1; i <= 1; i += 2) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.12), white);
      tooth.position.set(i * 0.25, eyeY - 0.62, eyeZ + (style === 0 ? 0.13 : 0.23));
      g.add(tooth);
    }
    // chân
    [-0.5, 0.5].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.55, 8), black);
      leg.position.set(x, 0.3, 0);
      g.add(leg);
      parts.legs.push(leg);
    });
    // tay
    if (style !== 0) {
      [-1, 1].forEach((s) => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 6), body);
        arm.position.set(s * (style === 1 ? 1.05 : 1.25), 1.4, 0);
        arm.rotation.z = s * 0.6;
        g.add(arm);
        parts.arms.push(arm);
      });
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.userData = parts;
    return g;
  }

  E.Brainrot = class {
    /**
     * base: tâm đường tuần tra, axis: hướng tuần tra (đơn vị), half: nửa độ dài tuần tra,
     * perpMax: biên theo trục vuông góc (khi đuổi theo)
     */
    constructor(scene, base, axis, half, perpMax, speed, style, chase, seed) {
      this.base = base; // {x,y,z}
      this.axis = axis; // {x,z}
      this.perp = { x: -axis.z, z: axis.x };
      this.half = half;
      this.perpMax = perpMax;
      this.speed = speed;
      this.chase = chase;
      this.chaseR = 13;
      this.s = (seed % 1) * half * 1.6 - half * 0.8;
      this.o = 0;
      this.dir = seed > 0.5 ? 1 : -1;
      this.t = seed * 10;
      this.model = buildBrainrot(style % 3, STYLE_COLORS[(style + ((seed * 4) | 0)) % STYLE_COLORS.length]);
      this.y = base.y;
      this.x = base.x;
      this.z = base.z;
      this.model.position.set(base.x, base.y, base.z);
      this.yaw = 0;
      this.mode = 'patrol';
      scene.add(this.model);
      this.apply();
    }
    apply() {
      this.x = this.base.x + this.axis.x * this.s + this.perp.x * this.o;
      this.z = this.base.z + this.axis.z * this.s + this.perp.z * this.o;
      this.model.position.set(this.x, this.y + Math.abs(Math.sin(this.t * 7)) * 0.25, this.z);
    }
    update(dt, t, ctx) {
      this.t += dt;
      const p = ctx.player.pos;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const dist = Math.hypot(dx, dz);
      const prevS = this.s;
      const prevO = this.o;
      const near = this.chase && dist < this.chaseR && Math.abs(p.y - this.y) < 3.5 && !ctx.player.invuln;
      if (near) {
        this.mode = 'chase';
        const ps = (p.x - this.base.x) * this.axis.x + (p.z - this.base.z) * this.axis.z;
        const po = (p.x - this.base.x) * this.perp.x + (p.z - this.base.z) * this.perp.z;
        const sp = this.speed * 1.2 * dt;
        this.s = U.clamp(U.approach(this.s, U.clamp(ps, -this.half, this.half), sp), -this.half, this.half);
        this.o = U.clamp(U.approach(this.o, U.clamp(po, -this.perpMax, this.perpMax), sp), -this.perpMax, this.perpMax);
      } else {
        this.mode = 'patrol';
        this.s += this.dir * this.speed * dt;
        if (this.s > this.half) { this.s = this.half; this.dir = -1; }
        if (this.s < -this.half) { this.s = -this.half; this.dir = 1; }
        this.o = U.approach(this.o, 0, this.speed * 0.6 * dt);
      }
      const mx = (this.s - prevS) * this.axis.x + (this.o - prevO) * this.perp.x;
      const mz = (this.s - prevS) * this.axis.z + (this.o - prevO) * this.perp.z;
      if (mx * mx + mz * mz > 1e-8) {
        const target = Math.atan2(mx, mz);
        this.yaw += U.angleDiff(this.yaw, target) * Math.min(1, dt * 10);
      }
      this.model.rotation.y = this.yaw;
      this.apply();
      // animation
      const ud = this.model.userData;
      const sw = Math.sin(this.t * 14) * 0.5;
      ud.legs.forEach((l, i) => { l.position.z = (i ? 1 : -1) * sw * 0.5; });
      ud.arms.forEach((a, i) => { a.rotation.x = (i ? 1 : -1) * sw * 1.2; });
      if (ud.body) ud.body.scale.y = (ud.body.userData.sy || (ud.body.userData.sy = ud.body.scale.y)) * (1 + Math.sin(this.t * 9) * 0.04);
    }
    hit(p) {
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      if (dx * dx + dz * dz > 1.35 * 1.35) return false;
      return p.y < this.y + 2.55 && p.y + 2.0 > this.y;
    }
  };

  // ------------------------------------------------------------------ Laser
  function segHitsBox(ax, ay, az, bx, by, bz, b) {
    // slab method
    let t0 = 0;
    let t1 = 1;
    const d = [bx - ax, by - ay, bz - az];
    const o = [ax, ay, az];
    const mn = [b.x0, b.y0, b.z0];
    const mx = [b.x1, b.y1, b.z1];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mn[i] || o[i] > mx[i]) return false;
      } else {
        let ta = (mn[i] - o[i]) / d[i];
        let tb = (mx[i] - o[i]) / d[i];
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
      }
    }
    return true;
  }
  E.segHitsBox = segHitsBox;

  E.Laser = class {
    constructor(scene, pos, baseYaw, sweepAmp, sweepSpeed, range, covers, phase) {
      this.pos = pos; // vị trí chân trụ
      this.baseYaw = baseYaw;
      this.amp = sweepAmp;
      this.spd = sweepSpeed;
      this.range = range;
      this.covers = covers;
      this.phase = phase || 0;
      this.cone = 0.5;
      this.eyeH = 6.5;
      this.lock = 0;
      this.state = 'scan';
      this.stateT = 0;
      this.yaw = baseYaw;
      this.warned = 0;

      const g = (this.group = new THREE.Group());
      g.position.set(pos.x, pos.y, pos.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, this.eyeH, 12), mat('#2b2140'));
      pole.position.y = this.eyeH / 2;
      pole.castShadow = true;
      g.add(pole);
      this.head = new THREE.Group();
      this.head.position.y = this.eyeH;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), mat('#3a2a5c', { roughness: 0.3 }));
      shell.castShadow = true;
      this.head.add(shell);
      this.eyeMat = new THREE.MeshStandardMaterial({ color: '#ff2b2b', emissive: '#ff0000', emissiveIntensity: 0.6 });
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), this.eyeMat);
      eye.position.set(0, 0, 1.0);
      this.head.add(eye);
      g.add(this.head);

      // hình quạt dò quét trên mặt sàn
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const a = -this.cone + (2 * this.cone * i) / n;
        shape.lineTo(Math.sin(a) * range, Math.cos(a) * range);
      }
      shape.lineTo(0, 0);
      const wedgeGeo = new THREE.ShapeGeometry(shape);
      wedgeGeo.rotateX(-Math.PI / 2); // shape (x, y) -> (x, 0, -y) ; ta cần hướng +z => lật lại
      wedgeGeo.scale(1, 1, -1);
      this.wedgeMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      this.wedge = new THREE.Mesh(wedgeGeo, this.wedgeMat);
      this.wedge.position.set(0, 0.05, 0);
      g.add(this.wedge);

      // tia
      this.beamMat = new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), this.beamMat);
      this.beam.visible = false;
      scene.add(this.beam);
      scene.add(g);
    }
    eyePos() { return { x: this.pos.x, y: this.pos.y + this.eyeH, z: this.pos.z }; }
    blocked(ex, ey, ez, px, py, pz) {
      for (let i = 0; i < this.covers.length; i++) {
        if (segHitsBox(ex, ey, ez, px, py, pz, this.covers[i])) return true;
      }
      return false;
    }
    setBeam(ex, ey, ez, px, py, pz, radius, opacity) {
      const dx = px - ex;
      const dy = py - ey;
      const dz = pz - ez;
      const len = Math.hypot(dx, dy, dz);
      this.beam.visible = opacity > 0.01;
      this.beamMat.opacity = opacity;
      this.beam.position.set((ex + px) / 2, (ey + py) / 2, (ez + pz) / 2);
      this.beam.scale.set(radius, len, radius);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    }
    update(dt, t, ctx) {
      const p = ctx.player.pos;
      const e = this.eyePos();
      const chestY = p.y + 1.1;
      this.stateT += dt;
      const sweep = this.baseYaw + this.amp * Math.sin(t * this.spd + this.phase);
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      const angTo = Math.atan2(dx, dz);
      const inCone = Math.abs(U.angleDiff(sweep, angTo)) < this.cone && dist < this.range;
      const visible = inCone && !ctx.player.invuln && !this.blocked(e.x, e.y, e.z, p.x, chestY, p.z);

      if (this.state === 'scan') {
        this.yaw += U.angleDiff(this.yaw, sweep) * Math.min(1, dt * 8);
        if (visible) {
          this.lock += dt;
          if (this.lock > 0.12 && this.warned < Math.floor(this.lock / 0.25) + 1) {
            this.warned = Math.floor(this.lock / 0.25) + 1;
            ctx.audio.warn();
          }
          this.setBeam(e.x, e.y, e.z, p.x, chestY, p.z, 0.07, Math.min(0.8, this.lock * 0.9));
        } else {
          this.lock = Math.max(0, this.lock - dt * 1.2);
          this.warned = 0;
          this.beam.visible = false;
        }
        if (this.lock >= 0.8) {
          this.state = 'fire';
          this.stateT = 0;
          this.lock = 0;
          this.warned = 0;
          ctx.audio.laser();
          if (visible) ctx.kill('laser');
          this.fireTarget = { x: p.x, y: chestY, z: p.z };
        }
      } else if (this.state === 'fire') {
        const ft = this.fireTarget;
        this.yaw += U.angleDiff(this.yaw, Math.atan2(ft.x - e.x, ft.z - e.z)) * Math.min(1, dt * 20);
        this.setBeam(e.x, e.y, e.z, ft.x, ft.y, ft.z, 0.45 * (1 - this.stateT / 0.35), 0.9);
        if (this.stateT > 0.35) {
          this.state = 'cool';
          this.stateT = 0;
          this.beam.visible = false;
        }
      } else {
        this.beam.visible = false;
        this.yaw += U.angleDiff(this.yaw, sweep) * Math.min(1, dt * 4);
        if (this.stateT > 1.2) { this.state = 'scan'; this.stateT = 0; }
      }
      this.head.rotation.y = this.yaw;
      this.wedge.rotation.y = this.yaw;
      const warn = this.state === 'fire' ? 1 : Math.min(1, this.lock / 0.8);
      this.eyeMat.emissiveIntensity = 0.5 + warn * 2.5;
      this.wedgeMat.opacity = 0.14 + warn * 0.3;
    }
  };
})();
