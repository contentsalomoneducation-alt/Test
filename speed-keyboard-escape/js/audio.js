/* Âm thanh tổng hợp bằng WebAudio (không cần file mp3): tiếng bàn phím cơ + SFX */
(function () {
  'use strict';
  const SKE = (window.SKE = window.SKE || {});

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let volume = 0.7;
  let pack = 'keyboard';
  let lastStep = -1;
  let lastType = -1;

  function makeNoise(c) {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = makeNoise(ctx);
    } catch (e) {
      ctx = null;
    }
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function out(node, pan) {
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      p.connect(master);
    } else node.connect(master);
  }

  function tone(freq, type, attack, decay, peak, freqEnd, delay, pan) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + attack + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g);
    out(g, pan);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  function noise(attack, decay, peak, ftype, ffreq, q, delay, pan) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.value = ffreq;
    f.Q.value = q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(f);
    f.connect(g);
    out(g, pan);
    s.start(t, Math.random() * 0.5);
    s.stop(t + attack + decay + 0.05);
  }

  // ------------------------------------------------------------------ bàn phím cơ
  // Mỗi switch: click (tiếng bấm gạt), thock (chạm đáy), ping (tấm đệm kim loại), up (nhả phím)
  const SWITCH = {
    keyboard: { click: 1.25, clickF: 3400, tick: 0.7, thock: 0.75, lp: 1800, body: 200, bd: 0.06, ping: 0.45, pingF: 2800, up: 0.55, upF: 5200 }, // Blue — clacky
    brown: { click: 0.3, clickF: 2600, tick: 0, thock: 0.85, lp: 1400, body: 170, bd: 0.07, ping: 0.15, pingF: 2400, up: 0.3, upF: 4200 }, // Brown — tactile
    red: { click: 0, clickF: 0, tick: 0, thock: 0.95, lp: 1100, body: 150, bd: 0.09, ping: 0.1, pingF: 2200, up: 0.2, upF: 3800 }, // Red — linear
    thock: { click: 0, clickF: 0, tick: 0, thock: 1.0, lp: 700, body: 105, bd: 0.13, ping: 0.05, pingF: 1500, up: 0.14, upF: 3000 }, // creamy thock
    laptop: { click: 0.15, clickF: 2200, tick: 0, thock: 0.5, lp: 2600, body: 260, bd: 0.035, ping: 0, pingF: 0, up: 0.1, upF: 3500 }, // membrane / laptop
  };
  const WIDE = ['Shift', 'Enter', 'Caps', 'Tab', '⌫', 'Space'];
  const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const KEY_PACKS = Object.keys(SWITCH).concat(['typewriter']);

  /** Cao độ theo vị trí phím trên bàn phím QWERTY (trái trầm hơn, phải cao hơn một chút) */
  function keyPitch(label) {
    if (!label) return 1;
    if (WIDE.indexOf(label) >= 0) return 0.82;
    for (let r = 0; r < ROWS.length; r++) {
      const c = ROWS[r].indexOf(label);
      if (c >= 0) return 0.93 + 0.14 * (c / 9) + (r - 1) * 0.015;
    }
    return 1;
  }

  /**
   * kind: tên switch; p: hệ số cao độ; wide: phím có thanh cân bằng (Shift/Enter/Space…);
   * vel: 0..1; pan: -1..1; delay: giây; upOnly: chỉ phát tiếng nhả
   */
  function keyVoice(kind, p, wide, vel, pan, delay, upOnly, downOnly) {
    if (!ctx) return;
    if (kind === 'typewriter') return typewriter(p, vel, pan, delay, upOnly, downOnly);
    const s = SWITCH[kind] || SWITCH.keyboard;
    const d0 = delay || 0;
    if (!upOnly) {
      if (s.click > 0) noise(0.0008, 0.012, 0.6 * s.click * vel, 'bandpass', s.clickF * p, 1.2, d0, pan);
      if (s.tick > 0) tone(4300 * p, 'sine', 0.0005, 0.008, 0.2 * s.tick * vel, 0, d0, pan);
      const bodyF = s.body * p * (wide ? 0.8 : 1);
      noise(0.001, 0.03, 0.55 * s.thock * vel, 'lowpass', s.lp * p, 0.7, d0 + 0.004, pan);
      tone(bodyF, 'sine', 0.002, s.bd * (wide ? 1.4 : 1), 0.75 * s.thock * vel * (wide ? 1.25 : 1), bodyF * 0.55, d0 + 0.003, pan);
      if (s.ping > 0) {
        tone(s.pingF * p, 'sine', 0.001, 0.03, 0.13 * s.ping * vel, 0, d0 + 0.004, pan);
        tone(s.pingF * p * 1.51, 'sine', 0.001, 0.02, 0.07 * s.ping * vel, 0, d0 + 0.004, pan);
      }
      if (wide) {
        // thanh cân bằng rung lách cách
        noise(0.0005, 0.006, 0.32 * vel, 'bandpass', 2300, 3, d0 + 0.012, pan);
        noise(0.0005, 0.005, 0.2 * vel, 'bandpass', 2700, 3, d0 + 0.03, pan);
      }
    }
    if (!downOnly && s.up > 0) {
      const du = d0 + (upOnly ? 0 : 0.1);
      noise(0.0005, 0.008, 0.45 * s.up * vel, 'bandpass', s.upF * p, 1.5, du, pan);
      tone(s.body * 1.7 * p, 'sine', 0.001, 0.025, 0.2 * s.up * vel, 0, du, pan);
    }
  }

  function typewriter(p, vel, pan, delay, upOnly, downOnly) {
    const d0 = delay || 0;
    if (!upOnly) {
      noise(0.0008, 0.02, 0.7 * vel, 'bandpass', 1900 * p, 0.8, d0, pan);
      [1, 2.76, 5.4].forEach((r, i) => tone(1180 * p * r, 'sine', 0.0008, [0.1, 0.06, 0.035][i], [0.26, 0.15, 0.09][i] * vel, 0, d0 + 0.002, pan));
      tone(125 * p, 'sine', 0.002, 0.09, 0.6 * vel, 70 * p, d0 + 0.002, pan);
    }
    if (!downOnly) {
      const du = d0 + (upOnly ? 0 : 0.11);
      noise(0.0005, 0.01, 0.3 * vel, 'bandpass', 3200 * p, 1.2, du, pan);
    }
  }

  const A = (SKE.audio = {
    init,
    resume,
    get ready() { return !!ctx; },
    keyPacks: KEY_PACKS,
    isKeyPack(id) { return KEY_PACKS.indexOf(id) >= 0; },
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
    },
    setPack(p) { pack = p; },
    keyPitch,

    /** Tiếng bước chân (mỗi step). opts: {label, pan} */
    step(pitch, opts) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastStep < 0.04) return;
      lastStep = now;
      const p = pitch || 1;
      const o = opts || {};
      if (KEY_PACKS.indexOf(pack) >= 0) {
        const label = o.label;
        const wide = label && WIDE.indexOf(label) >= 0;
        keyVoice(pack, p * keyPitch(label), !!wide, 0.85 + Math.random() * 0.15, o.pan || 0, 0, false, false);
        return;
      }
      switch (pack) {
        case 'chocolate':
          tone(210 * p, 'sine', 0.003, 0.11, 0.55, 90 * p);
          noise(0.003, 0.07, 0.2, 'lowpass', 700);
          break;
        case 'water':
          tone(420 * p, 'sine', 0.006, 0.13, 0.38, 900 * p);
          tone(840 * p, 'sine', 0.006, 0.08, 0.1, 1500 * p);
          break;
        case 'bubbles':
          tone(700 * p, 'sine', 0.002, 0.06, 0.32, 1700 * p);
          tone(1250 * p, 'sine', 0.002, 0.04, 0.1, 2200 * p, 0.015);
          break;
        case 'lava':
          noise(0.01, 0.15, 0.45, 'lowpass', 380);
          tone(95 * p, 'sawtooth', 0.01, 0.15, 0.16, 55 * p);
          break;
        default:
      }
    },

    /** Tiếng gõ khi người chơi bấm / nhả phím thật (WASD, Space…). Dùng đúng loại switch đã chọn. */
    keyType(down, key) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (down && now - lastType < 0.012) return;
      lastType = down ? now : lastType;
      const kind = KEY_PACKS.indexOf(pack) >= 0 ? pack : 'keyboard';
      const k = key && key.length === 1 ? key.toUpperCase() : key === ' ' ? 'Space' : key === 'Enter' ? 'Enter' : key === 'Tab' ? 'Tab' : key === 'Backspace' ? '⌫' : key === 'Shift' ? 'Shift' : '';
      const wide = WIDE.indexOf(k) >= 0;
      const p = keyPitch(k) * (0.97 + Math.random() * 0.06);
      keyVoice(kind, p, wide, down ? 0.65 : 0.85, (Math.random() - 0.5) * 0.3, 0, !down, down);
    },

    /** Nghe thử: gõ chuỗi phím như đang đánh máy */
    demo(kind) {
      if (!ctx) return;
      const word = ['T', 'H', 'I', 'N', 'K', 'Shift', 'F', 'A', 'S', 'T', 'Enter'];
      let t = 0;
      const k = KEY_PACKS.indexOf(kind) >= 0 ? kind : KEY_PACKS.indexOf(pack) >= 0 ? pack : 'keyboard';
      word.forEach((ch, i) => {
        t += 0.09 + Math.random() * 0.07 + (ch === 'Enter' ? 0.12 : 0);
        keyVoice(k, keyPitch(ch) * (0.97 + Math.random() * 0.06), WIDE.indexOf(ch) >= 0, 0.8 + Math.random() * 0.2, (i / word.length - 0.5) * 0.5, t, false, false);
      });
    },

    jump() { tone(300, 'sine', 0.005, 0.12, 0.22, 640); },
    land() { noise(0.002, 0.06, 0.25, 'lowpass', 500); tone(120, 'sine', 0.002, 0.08, 0.3, 70); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 'triangle', 0.005, 0.28, 0.32, 0, i * 0.075)); },
    buy() { tone(880, 'square', 0.002, 0.07, 0.16); tone(1320, 'square', 0.002, 0.12, 0.16, 0, 0.07); },
    deny() { tone(190, 'sawtooth', 0.003, 0.14, 0.2, 140); },
    click() { tone(1000, 'sine', 0.002, 0.04, 0.12); },
    levelUp() { [660, 880, 1100].forEach((f, i) => tone(f, 'sine', 0.004, 0.16, 0.25, 0, i * 0.06)); },
    rebirth() {
      tone(200, 'sawtooth', 0.02, 0.9, 0.2, 1600);
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.01, 0.6, 0.28, 0, 0.5 + i * 0.09));
    },
    die() { tone(520, 'square', 0.004, 0.32, 0.2, 90); noise(0.003, 0.12, 0.25, 'lowpass', 900); },
    splash() { noise(0.004, 0.28, 0.4, 'lowpass', 1400); tone(240, 'sine', 0.004, 0.2, 0.25, 90); },
    warn() { tone(1500, 'square', 0.002, 0.08, 0.1); },
    laser() { noise(0.002, 0.25, 0.4, 'bandpass', 3000, 2); tone(1800, 'sawtooth', 0.002, 0.25, 0.2, 200); },
    checkpoint() { tone(740, 'triangle', 0.004, 0.14, 0.22); tone(988, 'triangle', 0.004, 0.2, 0.22, 0, 0.08); },
    vanish() { tone(340, 'triangle', 0.003, 0.12, 0.12, 160); },

    /** Dùng cho kiểm thử: gắn AudioContext (ví dụ OfflineAudioContext) để render âm thanh ra mảng mẫu */
    _inject(c) {
      ctx = c;
      master = c.createGain();
      master.gain.value = volume;
      master.connect(c.destination);
      noiseBuf = makeNoise(c);
      lastStep = -1;
      lastType = -1;
    },
  });
})();
