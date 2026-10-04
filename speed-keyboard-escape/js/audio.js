/* Âm thanh tổng hợp bằng WebAudio (không cần file mp3) — ASMR click + SFX */
(function () {
  'use strict';
  const SKE = (window.SKE = window.SKE || {});

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let volume = 0.7;
  let pack = 'keyboard';
  let lastStep = 0;

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
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, type, attack, decay, peak, freqEnd, delay) {
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
    g.connect(master);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  function noise(attack, decay, peak, ftype, ffreq, q, delay) {
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
    g.connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + attack + decay + 0.05);
  }

  const A = (SKE.audio = {
    init,
    resume,
    get ready() { return !!ctx; },
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
    },
    setPack(p) { pack = p; },

    /** Tiếng bước chân (mỗi step) */
    step(pitch) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastStep < 0.04) return;
      lastStep = now;
      const p = pitch || 1;
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
        default: // keyboard — thock + click
          noise(0.001, 0.022, 0.5, 'highpass', 2600, 0.7);
          tone(560 * p, 'square', 0.001, 0.04, 0.13, 300 * p);
          tone(2300 * p, 'sine', 0.001, 0.018, 0.1);
          tone(150 * p, 'sine', 0.002, 0.07, 0.35, 90 * p);
      }
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
  });
})();
