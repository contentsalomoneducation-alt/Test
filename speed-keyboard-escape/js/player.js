/* Nhân vật (avatar kiểu Roblox), vật lý va chạm AABB, camera, input */
(function () {
  'use strict';
  const SKE = window.SKE;
  const THREE = window.THREE;
  const U = SKE.util;
  const D = SKE.data;

  // ============================================================ Avatar
  function faceTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffd34d';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1b1b1b';
    g.beginPath(); g.ellipse(42, 54, 8, 13, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(86, 54, 8, 13, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath(); g.arc(64, 74, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function shirtTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#3b82f6';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    g.font = `800 62px ${SKE.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('+1', 64, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  class Avatar {
    constructor() {
      const g = (this.group = new THREE.Group());
      const skin = new THREE.MeshStandardMaterial({ color: '#ffd34d', roughness: 0.6 });
      const legMat = new THREE.MeshStandardMaterial({ color: '#2fb36b', roughness: 0.6 });
      const shirtFront = new THREE.MeshStandardMaterial({ map: shirtTexture(), roughness: 0.6 });
      const shirt = new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.6 });
      const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.6 });
      const box = (w, h, d, m) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.castShadow = true;
        return mesh;
      };
      // thân
      this.torso = box(0.95, 0.72, 0.5, [shirt, shirt, shirt, shirt, shirtFront, shirt]);
      this.torso.position.y = 1.16;
      g.add(this.torso);
      // đầu (mặt hướng +z)
      this.head = box(0.62, 0.6, 0.62, [skin, skin, skin, skin, faceMat, skin]);
      this.head.position.y = 1.8;
      g.add(this.head);
      // chân / tay có pivot ở hông/vai
      const limb = (w, h, d, m, x, y) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        const mesh = box(w, h, d, m);
        mesh.position.y = -h / 2;
        pivot.add(mesh);
        g.add(pivot);
        return pivot;
      };
      this.legL = limb(0.4, 0.8, 0.4, legMat, -0.22, 0.8);
      this.legR = limb(0.4, 0.8, 0.4, legMat, 0.22, 0.8);
      this.armL = limb(0.32, 0.74, 0.32, skin, -0.64, 1.48);
      this.armR = limb(0.32, 0.74, 0.32, skin, 0.64, 1.48);
      this.phase = 0;
      this.swing = 0;
      this.air = 0;
      this.yaw = 0;
      this.squash = 0;
    }
    /** run: 0..1 cường độ chạy; cadence: chu kỳ/giây */
    update(dt, run, cadence, airborne, vy) {
      this.phase += dt * cadence * Math.PI * 2;
      this.swing = U.damp(this.swing, run, 14, dt);
      this.air = U.damp(this.air, airborne ? 1 : 0, 16, dt);
      const s = Math.sin(this.phase) * this.swing * 1.0;
      const a = this.air;
      this.legL.rotation.x = U.lerp(s, 0.5, a);
      this.legR.rotation.x = U.lerp(-s, -0.35, a);
      this.armL.rotation.x = U.lerp(-s, -2.5 + Math.min(0.6, Math.max(-0.6, vy * 0.02)), a);
      this.armR.rotation.x = U.lerp(s, -2.5 + Math.min(0.6, Math.max(-0.6, vy * 0.02)), a);
      const bob = Math.abs(Math.sin(this.phase)) * 0.08 * this.swing * (1 - a);
      this.torso.position.y = 1.16 + bob;
      this.head.position.y = 1.8 + bob;
      this.group.rotation.y = this.yaw;
      this.group.scale.y = 1 - this.squash * 0.18;
      this.squash = U.damp(this.squash, 0, 14, dt);
    }
  }

  // ============================================================ Player
  class Player {
    constructor(world) {
      this.world = world;
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.half = 0.4;
      this.h = 2.1;
      this.grounded = false;
      this.ground = null;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.invuln = 0;
      this.avatar = new Avatar();
      this.buf = [];
      this.justLanded = 0;
      this.justJumped = false;
      this.hasInput = false;
      this.stuck = 0;
    }
    place(x, y, z) {
      this.pos.set(x, y, z);
      this.vel.set(0, 0, 0);
      this.grounded = false;
      this.ground = null;
    }
    overlapXZ(b) {
      const h = this.half;
      return this.pos.x + h > b.x0 && this.pos.x - h < b.x1 && this.pos.z + h > b.z0 && this.pos.z - h < b.z1;
    }
    q() {
      const h = this.half + 0.1;
      return this.world.query(this.pos.x - h, this.pos.y - 0.6, this.pos.z - h, this.pos.x + h, this.pos.y + this.h + 0.6, this.pos.z + h, this.buf);
    }
    stepY(dt) {
      const prevY = this.pos.y;
      this.pos.y += this.vel.y * dt;
      const list = this.q();
      const tol = Math.max(0.3, -this.vel.y * dt + 0.1);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!this.overlapXZ(b)) continue;
        if (this.pos.y < b.y1 && this.pos.y + this.h > b.y0) {
          if (this.vel.y <= 0 && prevY >= b.y1 - tol) {
            this.pos.y = b.y1;
            this.vel.y = 0;
            this.grounded = true;
            this.ground = b;
          } else if (this.vel.y > 0 && prevY + this.h <= b.y0 + 0.3) {
            this.pos.y = b.y0 - this.h;
            this.vel.y = 0;
          }
        }
      }
    }
    stepAxis(dt, axis) {
      const v = this.vel[axis];
      this.pos[axis] += v * dt;
      const list = this.q();
      const h = this.half;
      const lo = axis === 'x' ? 'x0' : 'z0';
      const hi = axis === 'x' ? 'x1' : 'z1';
      const oth = axis === 'x' ? 'z' : 'x';
      const olo = axis === 'x' ? 'z0' : 'x0';
      const ohi = axis === 'x' ? 'z1' : 'x1';
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!(this.pos[oth] + h > b[olo] && this.pos[oth] - h < b[ohi])) continue;
        if (!(this.pos[axis] + h > b[lo] && this.pos[axis] - h < b[hi])) continue;
        if (!(this.pos.y < b.y1 - 0.001 && this.pos.y + this.h > b.y0)) continue;
        const rise = b.y1 - this.pos.y;
        if (rise > 0 && rise <= 0.55 && this.vel.y <= 0.01) {
          this.pos.y = b.y1; // bước lên bậc thấp
          this.grounded = true;
          this.ground = b;
          continue;
        }
        if (v > 0) this.pos[axis] = b[lo] - h - 1e-4;
        else if (v < 0) this.pos[axis] = b[hi] + h + 1e-4;
        else {
          const a = this.pos[axis] + h - b[lo];
          const c = b[hi] - (this.pos[axis] - h);
          this.pos[axis] += a < c ? -a : c;
        }
        this.vel[axis] = 0;
      }
    }
    probeGround() {
      const list = this.q();
      let best = null;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!this.overlapXZ(b)) continue;
        if (b.y1 <= this.pos.y + 0.06 && b.y1 >= this.pos.y - 0.12 && (!best || b.y1 > best.y1)) best = b;
      }
      if (best && this.vel.y <= 0.01) {
        this.grounded = true;
        this.ground = best;
      }
    }

    /**
     * input: {ax, ay} (phải/tiến), jump (bool nhấn), camYaw, moveSpeed
     */
    update(dt, input, moveSpeed, audio) {
      const wasGrounded = this.grounded;
      const fallSpeed = this.vel.y;
      // carry theo sàn di động
      if (this.ground && this.ground.dyn && this.ground.owner && this.ground.dx !== undefined) {
        this.pos.x += this.ground.dx;
        this.pos.z += this.ground.dz;
      }
      const sy = Math.sin(input.camYaw);
      const cy = Math.cos(input.camYaw);
      let dx = input.ax * cy + input.ay * -sy;
      let dz = input.ax * -sy + input.ay * -cy;
      const len = Math.hypot(dx, dz);
      this.hasInput = len > 0.05;
      if (len > 1) { dx /= len; dz /= len; }
      const tx = this.hasInput ? dx * moveSpeed : 0;
      const tz = this.hasInput ? dz * moveSpeed : 0;
      let rate;
      if (this.grounded) rate = this.hasInput ? moveSpeed * 10 : moveSpeed * 8;
      else rate = this.hasInput ? moveSpeed * 2.6 : moveSpeed * 0.25;
      const vx = tx - this.vel.x;
      const vz = tz - this.vel.z;
      const vl = Math.hypot(vx, vz);
      const step = rate * dt;
      if (vl <= step || vl < 1e-6) { this.vel.x = tx; this.vel.z = tz; }
      else { this.vel.x += (vx / vl) * step; this.vel.z += (vz / vl) * step; }
      // nhảy (coyote + buffer)
      this.coyote = this.grounded ? 0.1 : this.coyote - dt;
      this.jumpBuf = input.jump ? 0.12 : this.jumpBuf - dt;
      this.justJumped = false;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vel.y = D.JUMP_V;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.grounded = false;
        this.ground = null;
        this.justJumped = true;
        if (audio) audio.jump();
      }
      this.vel.y = Math.max(-70, this.vel.y - D.GRAVITY * dt);
      this.grounded = false;
      const prevGround = this.ground;
      this.ground = null;
      // di chuyển + va chạm (chia nhỏ để không xuyên khối ở tốc độ cao)
      const sp = Math.hypot(this.vel.x, this.vel.z) + Math.abs(this.vel.y);
      const n = Math.max(1, Math.ceil((sp * dt) / 0.3));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.stepY(h);
        this.stepAxis(h, 'x');
        this.stepAxis(h, 'z');
      }
      this.probeGround();
      if (!this.grounded && prevGround && prevGround.dyn && !prevGround.active) this.ground = null;
      this.justLanded = 0;
      if (this.grounded && !wasGrounded && fallSpeed < -8) {
        this.justLanded = -fallSpeed;
        this.avatar.squash = Math.min(1, -fallSpeed / 40);
        if (audio) audio.land();
      }
      if (this.invuln > 0) this.invuln -= dt;
      this.avatar.group.position.copy(this.pos);
    }
  }

  // ============================================================ Camera
  class CameraRig {
    constructor(camera) {
      this.cam = camera;
      this.yaw = 0;
      this.pitch = 0.42;
      this.dist = 15;
      this.focus = new THREE.Vector3();
      this.fov = 68;
      this.shake = 0;
    }
    snap(target, yaw) {
      this.focus.set(target.x, target.y + 1.7, target.z);
      if (yaw !== undefined) this.yaw = yaw;
    }
    update(dt, target, moveSpeed, speedXZ) {
      const lam = 11 + moveSpeed * 0.25;
      const k = 1 - Math.exp(-lam * dt);
      this.focus.x += (target.x - this.focus.x) * k;
      this.focus.z += (target.z - this.focus.z) * k;
      this.focus.y += (target.y + 1.7 - this.focus.y) * (1 - Math.exp(-7 * dt));
      const cp = Math.cos(this.pitch);
      const d = this.dist;
      this.cam.position.set(
        this.focus.x + Math.sin(this.yaw) * cp * d,
        this.focus.y + Math.sin(this.pitch) * d,
        this.focus.z + Math.cos(this.yaw) * cp * d
      );
      if (this.shake > 0) {
        this.cam.position.x += (Math.random() - 0.5) * this.shake;
        this.cam.position.y += (Math.random() - 0.5) * this.shake;
        this.shake = Math.max(0, this.shake - dt * 2);
      }
      this.cam.lookAt(this.focus);
      const targetFov = 68 + Math.min(22, Math.max(0, speedXZ - 12) * 0.32);
      this.fov = U.damp(this.fov, targetFov, 4, dt);
      if (Math.abs(this.cam.fov - this.fov) > 0.01) {
        this.cam.fov = this.fov;
        this.cam.updateProjectionMatrix();
      }
    }
  }

  // ============================================================ Input
  class Input {
    constructor(canvas) {
      this.keys = new Set();
      this.stick = { x: 0, y: 0 };
      this.jumpQueued = false;
      this.jumpHeld = false;
      this.camYawDelta = 0;
      this.camPitchDelta = 0;
      this.zoom = 0;
      this.sens = 1;
      this.handlers = [];
      this.dragId = null;
      const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
      window.addEventListener('keydown', (e) => {
        if (typing(e)) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
        if (k === ' ') {
          if (!this.jumpHeld) this.jumpQueued = true;
          this.jumpHeld = true;
        }
        if (!e.repeat) this.handlers.forEach((h) => h(k, e));
        this.keys.add(k);
      });
      window.addEventListener('keyup', (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === ' ') this.jumpHeld = false;
        this.keys.delete(k);
      });
      window.addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        if (this.dragId !== null) return;
        this.dragId = e.pointerId;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.dragId) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.camYawDelta -= dx * 0.0055 * this.sens;
        this.camPitchDelta += dy * 0.0045 * this.sens;
      });
      const end = (e) => { if (e.pointerId === this.dragId) this.dragId = null; };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY); }, { passive: false });
    }
    onKey(fn) { this.handlers.push(fn); }
    axes() {
      const k = this.keys;
      let ax = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
      let ay = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
      ax += this.stick.x;
      ay += this.stick.y;
      return { ax: U.clamp(ax, -1, 1), ay: U.clamp(ay, -1, 1) };
    }
    takeJump() {
      const j = this.jumpQueued;
      this.jumpQueued = false;
      return j;
    }
  }

  SKE.Avatar = Avatar;
  SKE.Player = Player;
  SKE.CameraRig = CameraRig;
  SKE.Input = Input;
})();
