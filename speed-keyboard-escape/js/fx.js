/* Hiệu ứng hạt (trail, aura, confetti, splash) bằng THREE.Points */
(function () {
  'use strict';
  const SKE = window.SKE;
  const THREE = window.THREE;

  const VERT = `
    attribute float size;
    attribute float alpha;
    attribute vec3 pcolor;
    varying float vAlpha;
    varying vec3 vColor;
    uniform float scale;
    void main() {
      vAlpha = alpha;
      vColor = pcolor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * scale / max(0.5, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d) * 2.0;
      if (r > 1.0) discard;
      float a = smoothstep(1.0, 0.2, r) * vAlpha;
      gl_FragColor = vec4(vColor, a);
    }`;

  class Particles {
    constructor(scene, max, additive) {
      this.max = max;
      this.next = 0;
      this.pos = new Float32Array(max * 3);
      this.vel = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.size = new Float32Array(max);
      this.alpha = new Float32Array(max);
      this.life = new Float32Array(max);
      this.maxLife = new Float32Array(max);
      this.grav = new Float32Array(max);
      this.size0 = new Float32Array(max);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { scale: { value: 600 } },
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      scene.add(this.points);
    }
    emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size0[i] = size;
      this.size[i] = size;
      this.alpha[i] = 1;
      this.grav[i] = grav || 0;
    }
    update(dt, viewportH, fov) {
      this.mat.uniforms.scale.value = viewportH / (2 * Math.tan((fov * Math.PI) / 360));
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) {
          if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; }
          continue;
        }
        this.life[i] -= dt;
        const i3 = i * 3;
        this.vel[i3 + 1] -= this.grav[i] * dt;
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        const k = Math.max(0, this.life[i] / this.maxLife[i]);
        this.alpha[i] = Math.min(1, k * 1.6);
        this.size[i] = this.size0[i] * (0.4 + 0.6 * k);
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.pcolor.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
      this.geo.attributes.alpha.needsUpdate = true;
    }
  }

  SKE.Particles = Particles;
})();
