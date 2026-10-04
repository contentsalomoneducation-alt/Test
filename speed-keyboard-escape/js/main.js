/* Vòng lặp game, kinh tế (Speed / Wins / Rebirth), trigger, hiệu ứng */
(function () {
  'use strict';
  const SKE = window.SKE;
  const THREE = window.THREE;
  const U = SKE.util;
  const D = SKE.data;
  const $ = U.$;
  const A = SKE.audio;

  const SAVE_KEY = 'ske_save_v1';

  function defaults() {
    return {
      speed: 0, wins: 0, rebirths: 0, stepTier: 0,
      treadOwned: [0], treadEq: 0,
      trailsOwned: [], trailEq: -1, aurasOwned: [], auraEq: -1,
      maxStage: 0, steps: 0, totalWins: 0, deaths: 0, helped: false,
      settings: { pack: 'keyboard', vol: 0.7, sens: 1, shadows: true, typing: true, mute: false },
    };
  }

  const srgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const hexNum = (h) => parseInt(h.replace('#', ''), 16);
  function hsl2rgb(h, s, l) {
    const c = new THREE.Color();
    c.setHSL(h, s, l, THREE.SRGBColorSpace);
    const o = {};
    c.getRGB(o, THREE.SRGBColorSpace);
    return [o.r, o.g, o.b];
  }

  function boot() {
    const canvas = $('#c');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('#loading').innerHTML = '<div><h1 class="stroke">Không khởi tạo được WebGL</h1><p>Hãy bật tăng tốc phần cứng trong trình duyệt rồi tải lại trang.</p></div>';
      return;
    }
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('touch');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 1400);
    scene.fog = new THREE.Fog('#ffe1f0', 90, 420);

    // ---- ánh sáng
    const hemi = new THREE.HemisphereLight('#ffffff', '#e0a8d0', 1.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58; sc.near = 10; sc.far = 260;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    scene.add(sun.target);

    // ---- bầu trời
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#6cc4ff') }, bottom: { value: new THREE.Color('#ffe1f0') } },
      vertexShader: 'varying vec3 vP;\nvoid main(){\n vP = normalize(position);\n gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n}',
      fragmentShader: 'uniform vec3 top;\nuniform vec3 bottom;\nvarying vec3 vP;\nvoid main(){\n float h = smoothstep(-0.05, 0.75, vP.y);\n gl_FragColor = vec4(mix(bottom, top, h), 1.0);\n#include <colorspace_fragment>\n}',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);

    // ---- thế giới / người chơi
    const world = new SKE.World(scene);
    const player = new SKE.Player(world);
    scene.add(player.avatar.group);
    const input = new SKE.Input(canvas);
    const cam = new SKE.CameraRig(camera);
    const glowFx = new SKE.Particles(scene, 1400, true);
    const solidFx = new SKE.Particles(scene, 900, false);

    const state = Object.assign(defaults(), U.load(SAVE_KEY, {}));
    state.settings = Object.assign(defaults().settings, state.settings || {});
    ['treadOwned', 'trailsOwned', 'aurasOwned'].forEach((k) => { if (!Array.isArray(state[k])) state[k] = defaults()[k]; });
    if (!state.treadOwned.includes(0)) state.treadOwned.push(0);

    // ------------------------------------------------------------ trạng thái runtime
    const rt = {
      time: 0, stepTimer: 0.1, foot: 0, checkpoint: world.lobbyCk, curStage: -2, dying: false, winLock: false,
      lastPad: null, lastLvl: 1, hudAcc: 0, saveAcc: 0, panel: false, trailAcc: 0, auraAcc: 0, themeT: 0, splashed: false,
      sparkAcc: 0, lastLevelSound: 0, airTime: 0,
    };
    const themeNow = { top: new THREE.Color('#6cc4ff'), bottom: new THREE.Color('#ffe1f0'), fog: new THREE.Color('#ffe1f0'), sea: new THREE.Color('#7a4a35'), light: 1 };
    const projV = new THREE.Vector3();

    // ------------------------------------------------------------ game API
    const game = {
      state, world, player, input, cam, rt, renderer, scene, camera,
      mults() {
        const reb = state.rebirths ? D.REBIRTHS[state.rebirths - 1].mult : 1;
        const trail = state.trailEq >= 0 ? D.TRAILS[state.trailEq].mult : 1;
        const aura = state.auraEq >= 0 ? D.AURAS[state.auraEq].mult : 1;
        const tread = D.TREADMILLS[state.treadEq].mult;
        const step = D.STEPS[state.stepTier].step;
        return { reb, trail, aura, tread, step, perStep: step * reb * trail * aura, treadmill: tread };
      },
      level() { return D.levelFromSpeed(state.speed); },
      canAffordSomething() {
        const w = state.wins;
        const ns = D.STEPS[state.stepTier + 1];
        if (ns && w >= ns.wins) return true;
        if (D.TREADMILLS.some((t, i) => !state.treadOwned.includes(i) && w >= t.cost)) return true;
        if (D.TRAILS.some((t, i) => !state.trailsOwned.includes(i) && w >= t.cost)) return true;
        if (D.AURAS.some((t, i) => !state.aurasOwned.includes(i) && w >= t.cost)) return true;
        return false;
      },
      onPanel(open) {
        rt.panel = open;
        if (open) { input.keys.clear(); input.stick.x = input.stick.y = 0; }
        ui.hud();
      },
      save() { U.save(SAVE_KEY, state); },
      changed() { ui.hud(); ui.refresh(); world.refreshPads(state); game.save(); },

      buyStep(i) {
        const st = D.STEPS[i];
        if (i !== state.stepTier + 1) return false;
        if (state.wins < st.wins) { A.deny(); ui.toast('Chưa đủ Wins!', 'bad', 1.6); return false; }
        state.wins -= st.wins;
        state.stepTier = i;
        A.buy();
        ui.toast(`Step Power +${U.fmt(st.step)} mỗi bước!`, 'good');
        burst(player.pos.x, player.pos.y + 1.2, player.pos.z, 30, [255, 226, 122]);
        game.changed();
        return true;
      },
      buyTread(i) {
        const t = D.TREADMILLS[i];
        if (state.treadOwned.includes(i)) return;
        if (state.wins < t.cost) { A.deny(); ui.toast('Chưa đủ Wins!', 'bad', 1.6); return; }
        state.wins -= t.cost;
        state.treadOwned.push(i);
        game.equipTread(i, true);
        A.buy();
        ui.toast(`${t.name} ${U.fmtMult(t.mult)}!`, 'good');
      },
      equipTread(i, silent) {
        state.treadEq = i;
        world.setTreadmillTier(i);
        if (!silent) A.click();
        game.changed();
      },
      buyCosmetic(kind, i) {
        const list = kind === 'trail' ? D.TRAILS : D.AURAS;
        const owned = kind === 'trail' ? state.trailsOwned : state.aurasOwned;
        const t = list[i];
        if (owned.includes(i)) return;
        if (state.wins < t.cost) { A.deny(); ui.toast('Chưa đủ Wins!', 'bad', 1.6); return; }
        state.wins -= t.cost;
        owned.push(i);
        A.buy();
        ui.toast(`${t.name} ${U.fmtMult(t.mult)}!`, 'good');
        game.equipCosmetic(kind, i, true);
      },
      equipCosmetic(kind, i, silent) {
        if (kind === 'trail') state.trailEq = i;
        else state.auraEq = i;
        if (!silent) A.click();
        game.changed();
      },
      rebirth() {
        const next = D.REBIRTHS[state.rebirths];
        if (!next || game.level() < next.level) { A.deny(); return; }
        state.rebirths++;
        state.speed = 0;
        rt.lastLvl = 1;
        A.rebirth();
        ui.close();
        ui.banner('REBIRTH ' + state.rebirths, U.fmtMult(next.mult), '#e5d1ff');
        ui.toast(`Rebirth thành công! Mỗi bước nhân ${U.fmtMult(next.mult)}`, 'purple', 3.2);
        teleportCk(world.lobbyCk, true);
        setTimeout(() => confetti(player.pos.x, player.pos.y + 1, player.pos.z, 160), 400);
        game.changed();
      },
      teleportStage(i) {
        if (i > state.maxStage) return;
        ui.close();
        teleportCk(world.plazaCk[i], true);
      },
      teleportSpawn() {
        ui.close();
        teleportCk(world.lobbyCk, true);
      },
      setPack(id) {
        state.settings.pack = id;
        A.setPack(id);
        A.resume();
        if (A.isKeyPack(id)) A.demo(id); else A.step(1);
        game.save();
      },
      /** Nút âm thanh trên HUD: chưa bật -> mở khoá + phát thử; đã bật -> tắt/mở tiếng */
      soundButton() {
        // bấm đầu tiên (vừa mở khoá âm thanh trong cùng cử chỉ) chỉ phát thử, không coi là tắt tiếng
        const justUnlocked = performance.now() - (rt.unlockT || -1e9) < 800;
        A.resume();
        if (A.status() !== 'running' || justUnlocked) { game.soundTest(); return; }
        const m = !A.muted;
        A.setMuted(m);
        state.settings.mute = m;
        if (!m) A.keyType(true, 'w');
        game.save();
        ui.hud();
      },
      soundTest() {
        A.resume();
        state.settings.mute = false;
        A.setMuted(false);
        // chờ context chạy rồi phát chuỗi gõ phím mẫu
        const go = () => { A.demo(); ui.hud(); };
        if (A.status() === 'running') go();
        else {
          let tries = 0;
          const iv = setInterval(() => {
            tries++;
            if (A.status() === 'running') { clearInterval(iv); go(); }
            else if (tries > 15) { clearInterval(iv); ui.toast('Trình duyệt vẫn chặn âm thanh. Hãy bật loa / tắt chế độ im lặng rồi bấm lại.', 'bad', 4); }
          }, 100);
        }
      },
      setTyping(v) {
        state.settings.typing = v;
        if (v) { A.resume(); A.keyType(true, 'w'); A.keyType(false, 'w'); }
        game.save();
      },
      setVolume(v) { state.settings.vol = v; A.setVolume(v); game.save(); },
      setSens(v) { state.settings.sens = v; input.sens = v; game.save(); },
      setShadows(v) {
        state.settings.shadows = v;
        renderer.shadowMap.enabled = v;
        sun.castShadow = v;
        scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
        game.save();
      },
      resetSave() {
        try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        window.location.reload();
      },
      leaderboard() {
        const rows = D.BOTS.map((name, i) => {
          const base = 2000 * Math.pow(6.5, 6 - i) * (1 + 0.04 * Math.sin(rt.time * 0.3 + i * 2));
          return { name, speed: base, wins: Math.floor(base / 2500) + i * 40 };
        });
        rows.push({ name: 'Bạn', speed: state.speed, wins: state.totalWins, me: true });
        rows.sort((a, b) => b.speed - a.speed);
        return rows;
      },
    };

    const ui = new SKE.UI(game);
    game.ui = ui;

    // ------------------------------------------------------------ hiệu ứng
    function burst(x, y, z, n, rgb) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 6;
        glowFx.emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 0.7 + Math.random() * 0.5, 0.5 + Math.random() * 0.4, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 8);
      }
    }
    function confetti(x, y, z, n) {
      const cols = ['#ff6fa5', '#ffd23f', '#6df0b0', '#6cc4ff', '#b57bff', '#ffffff'];
      for (let i = 0; i < n; i++) {
        const c = srgb(hexNum(cols[(Math.random() * cols.length) | 0]));
        const a = Math.random() * Math.PI * 2;
        const s = 3 + Math.random() * 11;
        solidFx.emit(x, y, z, Math.cos(a) * s, 6 + Math.random() * 14, Math.sin(a) * s, 1.4 + Math.random() * 1.2, 0.35 + Math.random() * 0.35, c[0], c[1], c[2], 22);
      }
    }
    function puff(x, y, z, rgb, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        solidFx.emit(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * 2.2, 0.8 + Math.random() * 1.2, Math.sin(a) * 2.2, 0.35, 0.3 + Math.random() * 0.25, rgb[0], rgb[1], rgb[2], 3);
      }
    }
    function splash(x, z) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 6;
        solidFx.emit(x, world.seaY + 0.3, z, Math.cos(a) * s, 6 + Math.random() * 10, Math.sin(a) * s, 1.1, 0.5 + Math.random() * 0.5, 0.45, 0.25, 0.12, 24);
      }
    }
    function trailColor(def, t) {
      if (def.color === 'rainbow') return hsl2rgb((t * 0.6 + Math.random() * 0.1) % 1, 1, 0.6);
      const c = srgb(hexNum(def.color[Math.random() < 0.5 ? 0 : 1]));
      return c;
    }

    // ------------------------------------------------------------ teleport / respawn
    function placeAt(ck) {
      player.place(ck.x, ck.y + 0.05, ck.z);
      player.avatar.yaw = ck.yaw + Math.PI;
      cam.snap(player.pos, ck.yaw);
      rt.stepTimer = 0.1;
      rt.splashed = false;
    }
    function teleportCk(ck, fade) {
      rt.checkpoint = ck.stage === -1 || ck.plaza ? ck : rt.checkpoint;
      rt.winLock = true;
      if (fade) {
        ui.fade(true);
        setTimeout(() => {
          placeAt(ck);
          rt.checkpoint = ck;
          player.invuln = 1.0;
          setTimeout(() => { ui.fade(false); rt.winLock = false; }, 120);
        }, 380);
      } else {
        placeAt(ck);
        rt.checkpoint = ck;
        rt.winLock = false;
      }
    }
    function kill(reason) {
      if (rt.dying || player.invuln > 0) return;
      rt.dying = true;
      state.deaths++;
      A.die();
      ui.flash();
      cam.shake = 0.6;
      burst(player.pos.x, player.pos.y + 1, player.pos.z, 36, [255, 111, 165]);
      const msg = { laser: 'Bị tia laser bắn trúng!', brainrot: 'Brainrot bắt được bạn!', spinner: 'Trúng thanh quay!', fall: 'Rơi xuống biển chocolate!' }[reason] || 'Oops!';
      ui.toast(msg, 'bad', 1.6);
      player.avatar.group.visible = false;
      setTimeout(() => {
        placeAt(rt.checkpoint);
        player.invuln = 1.6;
        player.avatar.group.visible = true;
        rt.dying = false;
      }, 520);
    }

    // ------------------------------------------------------------ trigger
    function onWin(stageIdx) {
      if (rt.winLock) return;
      rt.winLock = true;
      const st = D.STAGES[stageIdx];
      state.wins += st.wins;
      state.totalWins += st.wins;
      state.maxStage = Math.max(state.maxStage, Math.min(D.STAGES.length - 1, stageIdx + 1));
      A.win();
      confetti(player.pos.x, player.pos.y + 1, player.pos.z, 120);
      ui.toast(`+${U.fmt(st.wins)} WINS!`, '', 2.6, true);
      if (stageIdx < D.STAGES.length - 1) ui.toast(`Đã mở checkpoint Stage ${stageIdx + 2} — bấm T để teleport`, 'info', 3);
      game.changed();
      setTimeout(() => {
        ui.fade(true);
        setTimeout(() => {
          placeAt(world.lobbyCk);
          rt.checkpoint = world.lobbyCk;
          player.invuln = 1;
          setTimeout(() => { ui.fade(false); rt.winLock = false; }, 120);
        }, 380);
      }, 900);
    }
    function onPad(pad) {
      if (pad.type === 'shop') ui.show('shop');
      else if (pad.type === 'rebirth') ui.show('rebirth');
      else if (pad.type === 'step') {
        if (state.stepTier >= pad.tier) ui.toast('Bạn đã sở hữu nút này rồi ✔', 'info', 1.4);
        else if (!game.buyStep(pad.tier)) { /* buyStep tự báo lỗi */ if (pad.tier !== state.stepTier + 1) ui.toast('Hãy mua các nút số trước đó trước!', 'bad', 1.6); }
      }
    }

    // ------------------------------------------------------------ bước chân
    function doStep(onTread) {
      const m = game.mults();
      const gain = m.perStep * (onTread ? m.tread : 1);
      state.speed += gain;
      state.steps++;
      rt.foot ^= 1;
      const g = player.ground;
      A.step((rt.foot ? 1.0 : 0.95) * (0.97 + Math.random() * 0.06), { label: g && g.label, pan: rt.foot ? 0.12 : -0.12 });
      if (g && g.pr) world.press(g);
      const gcol = g && g.kind === 'key' ? [1, 1, 1] : [1, 0.9, 0.95];
      puff(player.pos.x, player.pos.y, player.pos.z, gcol, 3);
      projV.set(player.pos.x, player.pos.y + 2.4, player.pos.z).project(camera);
      if (projV.z < 1) {
        const x = (projV.x * 0.5 + 0.5) * window.innerWidth + (rt.foot ? 18 : -18);
        const y = (-projV.y * 0.5 + 0.5) * window.innerHeight;
        ui.popup(`+${U.fmt(gain)}`, x, y, onTread && m.tread > 1 ? 'gold' : '');
      }
      const lvl = game.level();
      if (lvl > rt.lastLvl) {
        if (rt.time - rt.lastLevelSound > 1.2) {
          A.levelUp();
          ui.toast(`⬆ Level ${lvl}`, 'info', 1.4);
          rt.lastLevelSound = rt.time;
        }
        rt.lastLvl = lvl;
      }
      rt.hudDirty = true;
    }

    // ------------------------------------------------------------ hiệu ứng trail/aura mỗi frame
    function updateCosmetics(dt, horiz) {
      const p = player.pos;
      if (state.trailEq >= 0 && player.grounded && horiz > 2) {
        const def = D.TRAILS[state.trailEq];
        rt.trailAcc += dt * 70;
        while (rt.trailAcc > 1) {
          rt.trailAcc -= 1;
          const c = trailColor(def, rt.time);
          glowFx.emit(p.x + (Math.random() - 0.5) * 0.7, p.y + 0.15, p.z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.7, 0.55 + Math.random() * 0.35, c[0], c[1], c[2], 0);
        }
      }
      if (state.auraEq >= 0) {
        const def = D.AURAS[state.auraEq];
        rt.auraAcc += dt * 48;
        while (rt.auraAcc > 1) {
          rt.auraAcc -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = 0.8 + Math.random() * 0.4;
          const c = trailColor(def, rt.time + 0.5);
          let vy = 1.4 + Math.random() * 1.2;
          let tang = 0;
          if (def.id === 'fire') vy = 3 + Math.random() * 2;
          if (def.id === 'wind') { vy = 0.4; tang = 5; }
          if (def.id === 'water') vy = 0.8 + Math.random();
          const sys = def.id === 'void' ? solidFx : glowFx;
          sys.emit(p.x + Math.cos(a) * r, p.y + 0.2 + Math.random() * 1.8, p.z + Math.sin(a) * r, -Math.sin(a) * tang, vy, Math.cos(a) * tang, def.id === 'wind' ? 0.5 : 0.9, 0.45 + Math.random() * 0.45, c[0], c[1], c[2], 0);
        }
      }
    }

    // ------------------------------------------------------------ theme theo stage
    function updateTheme(dt, stageIdx) {
      const st = stageIdx >= 0 ? D.STAGES[stageIdx] : null;
      const top = st ? st.sky[0] : '#6cc4ff';
      const bot = st ? st.sky[1] : '#ffe1f0';
      const fog = st ? st.fog : '#ffe1f0';
      const light = st && st.dark ? 0.55 : 1;
      const k = 1 - Math.exp(-1.6 * dt);
      themeNow.top.lerp(new THREE.Color(top), k);
      themeNow.bottom.lerp(new THREE.Color(bot), k);
      themeNow.fog.lerp(new THREE.Color(fog), k);
      themeNow.light += (light - themeNow.light) * k;
      const seaT = new THREE.Color(st ? st.deck : '#5b3426').lerp(new THREE.Color(fog), 0.15);
      themeNow.sea.lerp(seaT, k);
      skyMat.uniforms.top.value.copy(themeNow.top);
      skyMat.uniforms.bottom.value.copy(themeNow.fog);
      scene.fog.color.copy(themeNow.fog);
      hemi.intensity = 1.7 * themeNow.light;
      sun.intensity = 2.6 * (0.45 + 0.55 * themeNow.light);
    }

    // ------------------------------------------------------------ phím tắt
    input.onKey((k) => {
      A.resume();
      if (k === 'Escape') { if (ui.open) ui.close(); else ui.show('settings'); return; }
      if (k === 'b') ui.toggle('shop');
      else if (k === 'r') ui.toggle('rebirth');
      else if (k === 't') ui.toggle('stages');
      else if (k === 'Tab') ui.toggle('board');
      else if (k === 'h') ui.toggle('help');
      else if (k === 'e' && ui.open === 'rebirth') game.rebirth();
    });
    window.addEventListener('pointerdown', () => A.resume(), { once: false });

    // ------------------------------------------------------------ touch controls
    (function touchSetup() {
      const stick = $('#stick');
      const knob = $('#knob');
      let id = null;
      const move = (e) => {
        const r = stick.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width / 2);
        let dy = (e.clientY - cy) / (r.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        input.stick.x = dx;
        input.stick.y = -dy;
        knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
      };
      stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); move(e); A.resume(); });
      stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
      const end = (e) => { if (e.pointerId === id) { id = null; input.stick.x = input.stick.y = 0; knob.style.transform = ''; } };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
      const jb = $('#jumpBtn');
      jb.addEventListener('pointerdown', (e) => { e.preventDefault(); input.jumpQueued = true; A.resume(); });
    })();

    // ------------------------------------------------------------ resize
    function resize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    window.addEventListener('beforeunload', () => game.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

    // ------------------------------------------------------------ khởi tạo trạng thái
    A.setPack(state.settings.pack);
    A.setMuted(!!state.settings.mute);
    // Mở khoá âm thanh ở MỌI loại cử chỉ (chuột, chạm, bàn phím) — mobile chỉ tính touchend/pointerup
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'keydown'].forEach((ev) => {
      document.addEventListener(ev, () => {
        if (A.status() !== 'running') { A.resume(); rt.unlockT = performance.now(); ui.hud(); }
      }, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ui.hud(); });
    A.onState = (s) => { if (s === 'running') rt.unlockT = performance.now(); ui.hud(); };
    input.typing = (down, key) => { if (state.settings.typing && !rt.dying) A.keyType(down, key); };
    A.setVolume(state.settings.vol);
    input.sens = state.settings.sens;
    if (!state.settings.shadows) game.setShadows(false);
    world.setTreadmillTier(state.treadEq);
    world.refreshPads(state);
    placeAt(world.lobbyCk);
    rt.lastLvl = game.level();
    ui.setStage(null);
    ui.hud();

    // ------------------------------------------------------------ vòng lặp
    const ctx = { player, audio: A, kill, seaColor: themeNow.sea };
    let last = performance.now();
    function update(dt) {
      rt.time += dt;
      const t = rt.time;

      // camera orbit
      cam.yaw += input.camYawDelta;
      cam.pitch = U.clamp(cam.pitch + input.camPitchDelta, -0.05, 1.3);
      input.camYawDelta = 0;
      input.camPitchDelta = 0;
      if (input.zoom) { cam.dist = U.clamp(cam.dist * (1 + 0.1 * input.zoom), 5, 44); input.zoom = 0; }
      if (!rt.panel) {
        if (input.keys.has('i')) cam.dist = U.clamp(cam.dist - 14 * dt, 5, 44);
        if (input.keys.has('o')) cam.dist = U.clamp(cam.dist + 14 * dt, 5, 44);
      }

      world.update(dt, t, ctx);

      const moveSpeed = D.moveSpeed(state.speed);
      let ax = 0;
      let ay = 0;
      let jump = false;
      if (rt.auto) {
        // autopilot (chỉ dùng cho kiểm thử)
        const r = rt.auto(dt, player, cam);
        if (r && !rt.dying && !rt.winLock) {
          const sy = Math.sin(cam.yaw);
          const cy = Math.cos(cam.yaw);
          ay = r.dx * -sy + r.dz * -cy;
          ax = r.dx * cy + r.dz * -sy;
          jump = !!r.jump;
        }
      } else if (!rt.panel && !rt.dying && !rt.winLock) {
        const a = input.axes();
        ax = a.ax; ay = a.ay;
        jump = input.takeJump();
      } else input.jumpQueued = false;
      if (rt.dying) { player.vel.set(0, 0, 0); } else {
        player.update(dt, { ax, ay, jump, camYaw: cam.yaw }, moveSpeed, A);
      }
      const g = player.ground;
      const horiz = Math.hypot(player.vel.x, player.vel.z);

      // trigger theo mặt đứng
      if (g && !rt.dying) {
        if (g.kind === 'win') onWin(g.stage);
        if (g.kind === 'pad') { if (rt.lastPad !== g) { rt.lastPad = g; onPad(g.pad); } } else rt.lastPad = null;
        if (g.owner && g.owner.touch) g.owner.touch();
        if (g.ck && g.ck !== rt.checkpoint && !rt.winLock) {
          rt.checkpoint = g.ck;
          if (!g.ck.lobby) { A.checkpoint(); ui.toast('✔ Checkpoint đã lưu', 'good', 1.3); }
          if (g.ck.plaza && g.ck.stage >= 0 && g.ck.stage > state.maxStage) { state.maxStage = g.ck.stage; game.changed(); }
        }
        if (g.stage !== undefined && g.stage !== rt.curStage) {
          rt.curStage = g.stage;
          const st = g.stage >= 0 ? D.STAGES[g.stage] : null;
          ui.setStage(st);
          if (st) ui.banner(`STAGE ${g.stage + 1}`, st.name, st.accent);
          else ui.banner('SPAWN', 'Lobby', '#ffd6f0');
        }
      } else if (!g) rt.lastPad = null;

      // rơi xuống biển
      if (!rt.dying) {
        if (player.pos.y < world.seaY && !rt.splashed) { rt.splashed = true; splash(player.pos.x, player.pos.z); A.splash(); }
        if (player.pos.y < world.killY) kill('fall');
        if (player.pos.y > world.seaY + 2) rt.splashed = false;
      }

      // bước chân
      const onTread = !!(g && g.kind === 'treadmill');
      const walking = player.grounded && horiz > 1.5;
      const running = !rt.dying && (walking || (onTread && player.grounded));
      const interval = U.clamp(0.42 - 0.0045 * (moveSpeed - 9), 0.2, 0.42);
      if (running) {
        rt.stepTimer -= dt;
        if (rt.stepTimer <= 0) { doStep(onTread); rt.stepTimer += interval; if (rt.stepTimer < 0) rt.stepTimer = interval * 0.5; }
      } else rt.stepTimer = Math.min(rt.stepTimer, 0.08);

      // avatar
      const av = player.avatar;
      if (horiz > 1) av.yaw += U.angleDiff(av.yaw, Math.atan2(player.vel.x, player.vel.z)) * Math.min(1, dt * 16);
      else if (onTread) av.yaw += U.angleDiff(av.yaw, cam.yaw + Math.PI + Math.PI) * Math.min(1, dt * 8);
      const runAmt = running ? 1 : 0;
      av.update(dt, runAmt, 1 / interval / 2, !player.grounded, player.vel.y);
      if (player.invuln > 0 && !rt.dying) av.group.visible = Math.floor(t * 12) % 2 === 0 || player.invuln < 0.1;
      else if (!rt.dying) av.group.visible = true;

      updateCosmetics(dt, horiz);

      // camera + ánh sáng + hạt
      cam.update(dt, player.pos, moveSpeed, horiz);
      sun.position.set(player.pos.x + 38, player.pos.y + 70, player.pos.z + 26);
      sun.target.position.copy(player.pos);
      sun.target.updateMatrixWorld();
      sky.position.copy(camera.position);
      updateTheme(dt, rt.curStage >= 0 ? rt.curStage : -1);
      glowFx.update(dt, window.innerHeight * renderer.getPixelRatio(), camera.fov);
      solidFx.update(dt, window.innerHeight * renderer.getPixelRatio(), camera.fov);

      // HUD / lưu
      rt.hudAcc += dt;
      if (rt.hudDirty || rt.hudAcc > 0.5) { rt.hudDirty = false; rt.hudAcc = 0; ui.hud(); }
      rt.saveAcc += dt;
      if (rt.saveAcc > 5) { rt.saveAcc = 0; game.save(); }
    }
    game.update = update;
    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
      last = now;
      if (!rt.manual) {
        update(dt);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(frame);
    }

    // hướng dẫn lần đầu
    if (!state.helped) { state.helped = true; setTimeout(() => ui.show('help'), 700); }
    window.SKE_GAME = game;
    requestAnimationFrame((n) => { last = n; frame(n); });
    setTimeout(() => $('#loading').classList.add('done'), 300);
  }

  // chờ font (tối đa 1.2s) để canvas texture dùng đúng font
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('700 24px Fredoka'), new Promise((r) => setTimeout(r, 1200))])
    : Promise.resolve();
  fontReady.catch(() => {}).then(boot);
})();
