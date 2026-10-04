/* Dữ liệu game: stage, upgrade, treadmill, trail, aura, rebirth, công thức tốc độ */
(function () {
  'use strict';
  const SKE = (window.SKE = window.SKE || {});
  const D = (SKE.data = {});

  // ---- Vật lý (dùng chung để tính độ dài khe nhảy theo tốc độ khuyến nghị) ----
  D.GRAVITY = 70;
  D.JUMP_V = 24;
  D.AIR_TIME = (2 * D.JUMP_V) / D.GRAVITY; // ≈ 0.686s

  /** Tốc độ chạy (đơn vị/giây) theo điểm Speed — đường cong log nên vẫn "kiểm soát được" ở Speed khổng lồ */
  D.moveSpeed = (pts) => Math.min(70, 9 + 5.5 * Math.log10(1 + Math.max(0, pts) / 3));

  /** Level theo Speed: S(L) = 1.8 * (L-1)^2.4 */
  D.levelFromSpeed = (pts) => 1 + Math.floor(Math.pow(Math.max(0, pts) / 1.8, 1 / 2.4));
  D.speedForLevel = (L) => 1.8 * Math.pow(Math.max(0, L - 1), 2.4);

  // ---- 13 Stage (World 1) ----
  // wins: phần thưởng theo wiki; rec: Speed khuyến nghị (ước lượng để khe nhảy khớp tốc độ)
  const S = (name, wins, rec, caps, deck, sky, fog, accent, extra) =>
    Object.assign({ name, wins, rec, caps, deck, sky, fog, accent }, extra || {});

  D.STAGES = [
    S('Gummy Gateway', 1, 0, ['#ff8fb8', '#8be0a4', '#ffd36e', '#9ad7ff'], '#6b3f2e', ['#6cc4ff', '#ffe1f0'], '#ffe1f0', '#ff6fa5'),
    S('Candy Cane Walk', 3, 50, ['#ff5d6c', '#ffffff', '#ff8e9a', '#f4f4f4'], '#a32d3a', ['#ff9ab0', '#fff0f3'], '#ffe6ea', '#ff4d6d'),
    S('Chocolate Creek', 10, 300, ['#8a5a3c', '#c99a6e', '#f1d9b5', '#a8744a'], '#3f2416', ['#d9a679', '#f7e3cf'], '#f1dcc6', '#a3633a'),
    S('Marshmallow Maze', 20, 1200, ['#ffe3f1', '#d9c8ff', '#fff6d6', '#c9f0ff'], '#8d6f9c', ['#b9a6ff', '#fff1fb'], '#f6e9ff', '#c59bff'),
    S('Caramel Canyon', 60, 5000, ['#f3a847', '#e0802b', '#ffd28a', '#c76a1f'], '#5a3414', ['#ffb35c', '#ffe9c4'], '#ffe2b8', '#ff9a2e'),
    S('Lollipop Ledge', 100, 20000, ['#ff4fa3', '#4fd1ff', '#ffe14f', '#8f6bff', '#5dff9f'], '#4a2d63', ['#6ee7ff', '#ffd6f5'], '#fbe0ff', '#ff4fa3'),
    S('Fudge Falls', 150, 80000, ['#6a3f2a', '#2fc3b7', '#8b5a3f', '#26a59b'], '#2b170d', ['#2fc3b7', '#e5fff9'], '#d4f5ef', '#2fc3b7'),
    S('Sprinkle Sprint', 300, 400000, ['#ff6b9a', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'], '#5b3b73', ['#8fd3ff', '#fff4c9'], '#fff1d6', '#ffd93d'),
    S('Truffle Tunnel', 500, 2000000, ['#5a3a78', '#ffcf5c', '#3d2653', '#e0a93b'], '#1e1030', ['#3b2a63', '#a98be0'], '#7e66b0', '#ffcf5c', { dark: true }),
    S('Brainrot Boulevard', 1000, 10000000, ['#39ff88', '#b14dff', '#ff3df0', '#2de2ff'], '#14151f', ['#2a0f4a', '#7a2fb8'], '#5a2a8a', '#39ff88', { dark: true }),
    S('Waffle Warp', 2500, 80000000, ['#e8b04a', '#d89a2e', '#f6cf7a', '#32e6ff'], '#5d3a12', ['#2ee6ff', '#fff2c2'], '#c8f5ff', '#32e6ff'),
    S('Sugar Rush', 10000, 500000000, ['#ff2e93', '#2e8bff', '#ffffff', '#ff7ac2'], '#2a0f3f', ['#ff2e93', '#ffd0ec'], '#ffc2e6', '#ff2e93'),
    S('Cocoa Crown', 25000, 5000000000, ['#ffd23f', '#7b4a2a', '#fff0b3', '#b8860b'], '#2b1608', ['#ffcf4d', '#fff7d6'], '#ffeeb8', '#ffd23f'),
  ];

  // khe nhảy: ~90% quãng bay ở Speed khuyến nghị
  D.STAGES.forEach((st, i) => {
    st.index = i;
    st.recMove = D.moveSpeed(st.rec);
    const reach = st.recMove * D.AIR_TIME * 0.9;
    st.gap = Math.max(5, Math.round(reach * 2) / 2);
  });

  // ---- Step power (nút số trên hàng phím) ----
  D.STEPS = [
    { wins: 0, step: 1, key: '1' },
    { wins: 3, step: 2, key: '2' },
    { wins: 15, step: 3, key: '3' },
    { wins: 100, step: 25, key: '4' },
    { wins: 500, step: 50, key: '5' },
    { wins: 2500, step: 100, key: '6' },
    { wins: 15000, step: 250, key: '7' },
    { wins: 50000, step: 500, key: '8' },
  ];

  // ---- Treadmill (trong game gốc mua bằng Robux; ở đây mua bằng Wins) ----
  D.TREADMILLS = [
    { id: 'choc', name: 'Chocolate Treadmill', mult: 1, cost: 0, color: '#b0693a', glow: '#ffb27a' },
    { id: 'gold', name: 'Golden Treadmill', mult: 3, cost: 150, color: '#e0b030', glow: '#fff08a' },
    { id: 'diamond', name: 'Diamond Treadmill', mult: 9, cost: 2500, color: '#3fc7e6', glow: '#bff6ff' },
    { id: 'candy', name: 'Candy Treadmill', mult: 25, cost: 25000, color: '#ff5fa8', glow: '#ffc4e1' },
    { id: 'admin', name: 'Admin Treadmill', mult: 100, cost: 250000, color: '#d62839', glow: '#ff9aa4' },
  ];

  // ---- Trails (wins) & Auras (wins) — hệ số là ước lượng ----
  D.TRAILS = [
    { id: 'green', name: 'Green Trail', mult: 1.25, cost: 500, color: ['#7dff7d', '#2ecc40'] },
    { id: 'blue', name: 'Blue Trail', mult: 1.5, cost: 2500, color: ['#7dc8ff', '#2a7fff'] },
    { id: 'purple', name: 'Purple Trail', mult: 2, cost: 10000, color: ['#d59bff', '#8a2be2'] },
    { id: 'gold', name: 'Gold Trail', mult: 3, cost: 25000, color: ['#fff08a', '#ffb703'] },
    { id: 'fire', name: 'Fire Trail', mult: 5, cost: 50000, color: ['#ffd23f', '#ff3b1f'] },
    { id: 'rainbow', name: 'Rainbow Trail', mult: 8, cost: 100000, color: 'rainbow' },
  ];
  D.AURAS = [
    { id: 'glow', name: 'Glow Aura', mult: 12, cost: 1e6, color: ['#fffbd0', '#ffe066'] },
    { id: 'wind', name: 'Wind Aura', mult: 25, cost: 5e6, color: ['#e6fff5', '#8ef0d0'] },
    { id: 'water', name: 'Water Aura', mult: 50, cost: 1e7, color: ['#9fe3ff', '#2f8cff'] },
    { id: 'fire', name: 'Fire Aura', mult: 100, cost: 2.5e7, color: ['#ffe27a', '#ff4d1f'] },
    { id: 'void', name: 'Void Aura', mult: 250, cost: 5e7, color: ['#b44bff', '#1a0033'] },
    { id: 'godlike', name: 'Godlike Aura', mult: 1000, cost: 1e9, color: 'rainbow' },
  ];

  // ---- Rebirth: 20 mốc. R1 Lv15 ×1.5, R2 Lv25 ×2, R3 Lv40 ×2.5 … R20 Lv600 ≈ ×100B ----
  D.REBIRTHS = [];
  for (let k = 1; k <= 20; k++) {
    let level;
    let mult;
    if (k === 1) { level = 15; mult = 1.5; }
    else if (k === 2) { level = 25; mult = 2; }
    else if (k === 3) { level = 40; mult = 2.5; }
    else {
      level = Math.round((40 + 560 * Math.pow((k - 3) / 17, 1.3)) / 5) * 5;
      mult = 3.5 * Math.pow(4.5, k - 4);
      const mag = Math.pow(10, Math.floor(Math.log10(mult)) - 1);
      mult = Math.round(mult / mag) * mag; // làm tròn 2 chữ số có nghĩa
    }
    D.REBIRTHS.push({ n: k, level, mult });
  }

  // ---- Âm thanh bước chân ----
  D.PACKS = [
    { id: 'keyboard', name: 'Keyboard Click (Blue)', group: 'key' },
    { id: 'brown', name: 'Brown Switch', group: 'key' },
    { id: 'red', name: 'Red Linear', group: 'key' },
    { id: 'thock', name: 'Thocky', group: 'key' },
    { id: 'typewriter', name: 'Typewriter', group: 'key' },
    { id: 'laptop', name: 'Laptop', group: 'key' },
    { id: 'chocolate', name: 'Chocolate' },
    { id: 'water', name: 'Water' },
    { id: 'bubbles', name: 'Bubbles' },
    { id: 'lava', name: 'Lava' },
  ];

  // ---- Leaderboard giả lập (bot) ----
  D.BOTS = ['Noob_Slayer99', 'KeyboardKing', 'SpeedyGonzo', 'CandyRunner', 'xX_Brainrot_Xx', 'ChocoMilk', 'LunaDash'];
})();
