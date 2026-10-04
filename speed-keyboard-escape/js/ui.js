/* Giao diện: HUD + các bảng (Shop, Rebirth, Stages, Settings, Leaderboard, Help) */
(function () {
  'use strict';
  const SKE = window.SKE;
  const U = SKE.util;
  const D = SKE.data;
  const $ = U.$;
  const el = U.el;
  const A_status = () => (SKE.audio ? SKE.audio.status() : 'none');
  const A_muted = () => !!(SKE.audio && SKE.audio.muted);

  class UI {
    constructor(game) {
      this.g = game;
      this.modal = $('#modal');
      this.open = null;
      this.tab = { shop: 'step' };
      this.lastHud = 0;
      this.popCount = 0;
      this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal) this.close(); });
      $('#bShop').onclick = () => this.toggle('shop');
      $('#bReb').onclick = () => this.toggle('rebirth');
      $('#bStages').onclick = () => this.toggle('stages');
      $('#bBoard').onclick = () => this.toggle('board');
      $('#bSet').onclick = () => this.toggle('settings');
      $('#sndBtn').onclick = () => this.g.soundButton();
    }

    // ------------------------------------------------------------ HUD
    hud() {
      const g = this.g;
      const s = g.state;
      $('#vSpeed').textContent = U.fmt(s.speed);
      $('#vWins').textContent = U.fmt(s.wins);
      $('#vReb').textContent = String(s.rebirths);
      const m = g.mults();
      $('#stepInfo').innerHTML = `+${U.fmt(m.perStep)} / step${m.treadmill > 1 ? ` · <b style="color:#ffe27a">treadmill ×${U.fmt(m.treadmill)}</b>` : ''}`;
      const lvl = g.level();
      $('#lvlText').textContent = `Lv ${lvl}`;
      const next = D.REBIRTHS[s.rebirths];
      if (next) {
        const need = D.speedForLevel(next.level);
        const prev = D.speedForLevel(Math.min(lvl, next.level));
        const prog = U.clamp(s.speed / need, 0, 1);
        void prev;
        $('#lvlBar').style.width = (prog * 100).toFixed(1) + '%';
        $('#lvlNext').textContent = lvl >= next.level ? `✔ Sẵn sàng Rebirth! (${U.fmtMult(next.mult)})` : `Rebirth ${s.rebirths + 1} ở Lv ${next.level} → ${U.fmtMult(next.mult)}`;
      } else {
        $('#lvlBar').style.width = '100%';
        $('#lvlNext').textContent = 'MAX REBIRTH';
      }
      const snd = $('#sndBtn');
      const st = A_status();
      if (st !== 'running') { snd.className = 'click off'; snd.textContent = '🔇 Bấm để bật âm thanh'; }
      else if (A_muted()) { snd.className = 'click muted'; snd.textContent = '🔇 Đã tắt tiếng'; }
      else { snd.className = 'click'; snd.textContent = '🔊 Âm thanh'; }
      $('#bReb').classList.toggle('dot', !!next && lvl >= next.level);
      $('#bShop').classList.toggle('dot', g.canAffordSomething());
    }
    setStage(st) {
      const t = $('#stageTag');
      if (!st) t.innerHTML = '🏠 <b>Spawn</b> · Lobby';
      else t.innerHTML = `Stage <b>${st.index + 1}/13</b> · ${st.name} · Win +${U.fmt(st.wins)}`;
    }
    banner(l1, l2, color) {
      const b = $('#banner');
      $('#bn1').textContent = l1;
      const n2 = $('#bn2');
      n2.textContent = l2;
      n2.style.color = color || '#fff';
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
    }
    toast(msg, kind, life, big) {
      const box = $('#toasts');
      while (box.children.length > 3) box.removeChild(box.firstChild);
      const t = el('div', `toast ${kind || ''} ${big ? 'big' : ''}`, msg);
      t.style.setProperty('--life', (life || 2.4) + 's');
      box.appendChild(t);
      setTimeout(() => t.remove(), ((life || 2.4) + 0.6) * 1000);
    }
    popup(text, x, y, cls) {
      if (this.popCount > 14) return;
      this.popCount++;
      const p = el('div', 'pop ' + (cls || ''), text);
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      $('#popups').appendChild(p);
      p.addEventListener('animationend', () => { p.remove(); this.popCount--; });
    }
    flash() {
      const f = $('#flash');
      f.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
    }
    fade(on) { $('#fade').classList.toggle('on', on); }

    // ------------------------------------------------------------ Panels
    toggle(name) {
      if (this.open === name) this.close();
      else this.show(name);
    }
    show(name) {
      this.open = name;
      this.modal.classList.add('open');
      this.render();
      this.g.onPanel(true);
    }
    close() {
      if (!this.open) return;
      this.open = null;
      this.modal.classList.remove('open');
      this.modal.innerHTML = '';
      this.g.onPanel(false);
    }
    refresh() {
      if (this.open) this.render(true);
    }
    shell(title, h1, h2) {
      const p = el('div', 'panel');
      const head = el('div', 'ph');
      head.style.setProperty('--h1', h1);
      head.style.setProperty('--h2', h2);
      head.appendChild(el('h2', 'stroke', title));
      const x = el('button', 'x', '✕');
      x.onclick = () => this.close();
      head.appendChild(x);
      const body = el('div', 'pb');
      p.appendChild(head);
      p.appendChild(body);
      return { p, body };
    }
    render(keepScroll) {
      const prev = this.modal.querySelector('.pb');
      const sc = prev ? prev.scrollTop : 0;
      this.modal.innerHTML = '';
      let sh;
      switch (this.open) {
        case 'shop': sh = this.renderShop(); break;
        case 'rebirth': sh = this.renderRebirth(); break;
        case 'stages': sh = this.renderStages(); break;
        case 'settings': sh = this.renderSettings(); break;
        case 'board': sh = this.renderBoard(); break;
        case 'help': sh = this.renderHelp(); break;
        default: return;
      }
      this.modal.appendChild(sh.p);
      if (keepScroll) sh.body.scrollTop = sc;
    }

    // ---- Shop
    renderShop() {
      const g = this.g;
      const s = g.state;
      const sh = this.shell('🛒 Shop', '#ff9ec7', '#ff4f93');
      const tabs = el('div', 'tabs');
      [['step', '⚡ Step Power'], ['tread', '🏃 Treadmill'], ['trail', '🌈 Trails'], ['aura', '✨ Auras']].forEach(([id, label]) => {
        const t = el('button', 'tab' + (this.tab.shop === id ? ' on' : ''), label);
        t.onclick = () => { this.tab.shop = id; this.render(); };
        tabs.appendChild(t);
      });
      sh.body.appendChild(tabs);
      sh.body.appendChild(el('div', 'note', `Bạn có <b>${U.fmt(s.wins)} 🏆 Wins</b>. Speed mỗi bước = (Step Power) × Rebirth × Trail × Aura (× Treadmill khi đứng trên treadmill).`));
      const grid = el('div', 'grid');
      const tab = this.tab.shop;
      if (tab === 'step') {
        D.STEPS.forEach((st, i) => {
          if (i === 0) return;
          const owned = s.stepTier >= i;
          const next = s.stepTier + 1 === i;
          const c = el('div', 'card' + (owned ? ' eq' : ''));
          c.appendChild(el('h3', '', `Nút <b>${i + 1}</b> · +${U.fmt(st.step)} / step`));
          c.appendChild(el('div', 'meta', `Giá: ${U.fmt(st.wins)} 🏆`));
          const b = el('button', 'btn' + (owned ? ' gray' : next && s.wins >= st.wins ? ' gold' : ' gray'), owned ? '✔ Đã sở hữu' : next ? 'Mua' : '🔒 Mua nút trước');
          b.disabled = owned || !next;
          b.onclick = () => g.buyStep(i);
          c.appendChild(b);
          grid.appendChild(c);
        });
        sh.body.appendChild(grid);
        sh.body.appendChild(el('div', 'note', 'Mẹo: trong Lobby có hàng phím số 2–8 — bước lên phím tương ứng cũng mua được nâng cấp.'));
      } else if (tab === 'tread') {
        D.TREADMILLS.forEach((t, i) => {
          const owned = s.treadOwned.includes(i);
          const eq = s.treadEq === i;
          const c = el('div', 'card' + (eq ? ' eq' : ''));
          c.appendChild(el('h3', '', t.name));
          const sw = el('div', 'sw');
          sw.style.background = `linear-gradient(90deg, ${t.color}, ${t.glow})`;
          c.appendChild(sw);
          c.appendChild(el('div', 'meta', `Hệ số Speed: <b>${U.fmtMult(t.mult)}</b>` + (owned ? '' : ` · Giá: ${U.fmt(t.cost)} 🏆`)));
          let b;
          if (eq) { b = el('button', 'btn gray', '✔ Đang dùng'); b.disabled = true; }
          else if (owned) { b = el('button', 'btn', 'Dùng'); b.onclick = () => g.equipTread(i); }
          else { b = el('button', 'btn ' + (s.wins >= t.cost ? 'gold' : 'gray'), 'Mua'); b.onclick = () => g.buyTread(i); }
          c.appendChild(b);
          grid.appendChild(c);
        });
        sh.body.appendChild(grid);
        sh.body.appendChild(el('div', 'note', 'Đứng trên treadmill ở lobby hoặc đầu mỗi stage để nhân Speed khi chạy tại chỗ. (Game gốc bán treadmill bằng Robux; ở đây dùng Wins.)'));
      } else {
        const list = tab === 'trail' ? D.TRAILS : D.AURAS;
        const owned = tab === 'trail' ? s.trailsOwned : s.aurasOwned;
        const eqIdx = tab === 'trail' ? s.trailEq : s.auraEq;
        list.forEach((t, i) => {
          const has = owned.includes(i);
          const eq = eqIdx === i;
          const c = el('div', 'card' + (eq ? ' eq' : ''));
          c.appendChild(el('h3', '', t.name));
          const sw = el('div', 'sw');
          sw.style.background = t.color === 'rainbow' ? 'linear-gradient(90deg,#ff4d4d,#ffd23f,#6df0b0,#4dc3ff,#b57bff)' : `linear-gradient(90deg, ${t.color[0]}, ${t.color[1]})`;
          c.appendChild(sw);
          c.appendChild(el('div', 'meta', `Hệ số Speed: <b>${U.fmtMult(t.mult)}</b>` + (has ? '' : ` · Giá: ${U.fmt(t.cost)} 🏆`)));
          let b;
          if (eq) { b = el('button', 'btn gray', 'Tháo ra'); b.onclick = () => g.equipCosmetic(tab, -1); }
          else if (has) { b = el('button', 'btn', 'Trang bị'); b.onclick = () => g.equipCosmetic(tab, i); }
          else { b = el('button', 'btn ' + (s.wins >= t.cost ? 'gold' : 'gray'), 'Mua'); b.onclick = () => g.buyCosmetic(tab, i); }
          c.appendChild(b);
          grid.appendChild(c);
        });
        sh.body.appendChild(grid);
        sh.body.appendChild(el('div', 'note', 'Hệ số của Trail/Aura là ước lượng (game gốc không công bố chính xác).'));
      }
      return sh;
    }

    // ---- Rebirth
    renderRebirth() {
      const g = this.g;
      const s = g.state;
      const sh = this.shell('🔄 Rebirth', '#c9a6ff', '#8a5cff');
      const lvl = g.level();
      const next = D.REBIRTHS[s.rebirths];
      const cur = s.rebirths ? D.REBIRTHS[s.rebirths - 1].mult : 1;
      sh.body.appendChild(el('div', 'row', `<span>Hệ số hiện tại</span><span class="big">${U.fmtMult(cur)}</span>`));
      if (next) {
        const need = D.speedForLevel(next.level);
        sh.body.appendChild(el('div', 'row', `<span>Rebirth tiếp theo (#${next.n})</span><span>Lv <b>${next.level}</b> → <b>${U.fmtMult(next.mult)}</b></span>`));
        const bar = el('div', 'bar');
        bar.appendChild(el('i'));
        bar.firstChild.style.width = (U.clamp(s.speed / need, 0, 1) * 100).toFixed(1) + '%';
        sh.body.appendChild(bar);
        sh.body.appendChild(el('div', 'note', `Level hiện tại: <b>${lvl}</b> · Speed ${U.fmt(s.speed)} / ${U.fmt(need)}`));
        const b = el('button', 'btn pink', lvl >= next.level ? 'REBIRTH!' : `Cần Lv ${next.level}`);
        b.style.width = '100%';
        b.style.fontSize = '22px';
        b.disabled = lvl < next.level;
        b.onclick = () => g.rebirth();
        sh.body.appendChild(b);
      } else {
        sh.body.appendChild(el('div', 'note', '🎉 Bạn đã đạt Rebirth tối đa!'));
      }
      sh.body.appendChild(el('div', 'note', 'Rebirth đặt lại <b>Speed</b> và Level về 0, nhưng giữ Wins, Trails, Auras, Treadmill và Step Power.'));
      const t = el('table', 'rb');
      t.innerHTML = '<tr><th>#</th><th>Level cần</th><th>Hệ số Speed</th></tr>';
      D.REBIRTHS.forEach((r) => {
        const tr = el('tr', r.n <= s.rebirths ? 'done' : r.n === s.rebirths + 1 ? 'cur' : '');
        tr.innerHTML = `<td>${r.n}</td><td>${r.level}</td><td>${U.fmtMult(r.mult)}</td>`;
        t.appendChild(tr);
      });
      sh.body.appendChild(t);
      return sh;
    }

    // ---- Stages
    renderStages() {
      const g = this.g;
      const s = g.state;
      const sh = this.shell('🏁 Stages', '#7fe0ff', '#2f9bff');
      sh.body.appendChild(el('div', 'note', 'Chạm bệ vàng <b>WIN</b> cuối mỗi stage để nhận Wins rồi bị đưa về Spawn. Dùng bảng này để quay lại checkpoint đã mở khoá.'));
      const grid = el('div', 'grid');
      const sp = el('div', 'card stage-card');
      sp.innerHTML = '<div class="top" style="background:linear-gradient(90deg,#ff9ec7,#b57bff)"><span>🏠 Spawn</span></div>';
      const sbd = el('div', 'bd', '<div class="meta">Lobby: treadmill, Shop, Rebirth</div>');
      const sb = el('button', 'btn pink', 'Teleport');
      sb.onclick = () => g.teleportSpawn();
      sbd.appendChild(sb);
      sp.appendChild(sbd);
      grid.appendChild(sp);
      D.STAGES.forEach((st, i) => {
        const unlocked = i <= s.maxStage;
        const c = el('div', 'card stage-card' + (unlocked ? '' : ' lock'));
        const top = el('div', 'top', `<span>#${i + 1}</span><span>+${U.fmt(st.wins)} 🏆</span>`);
        top.style.background = `linear-gradient(90deg, ${st.caps[0]}, ${st.accent})`;
        c.appendChild(top);
        const bd = el('div', 'bd');
        bd.appendChild(el('h3', '', st.name));
        bd.appendChild(el('div', 'meta', `Speed khuyến nghị: <b>${U.fmt(st.rec)}</b>`));
        const b = el('button', 'btn ' + (unlocked ? '' : 'gray'), unlocked ? 'Teleport' : '🔒 Chưa mở');
        b.disabled = !unlocked;
        b.onclick = () => g.teleportStage(i);
        bd.appendChild(b);
        c.appendChild(bd);
        grid.appendChild(c);
      });
      sh.body.appendChild(grid);
      return sh;
    }

    // ---- Settings
    renderSettings() {
      const g = this.g;
      const st = g.state.settings;
      const sh = this.shell('⚙️ Cài đặt', '#b9c4d6', '#7a8aa6');
      const as = A_status();
      const asRow = el('div', 'row', `<span>Trạng thái âm thanh: <b>${as === 'running' ? (A_muted() ? 'đang tắt tiếng' : 'đang bật') : 'chưa bật (trình duyệt đang chặn)'}</b></span>`);
      const test = el('button', 'btn ' + (as === 'running' ? '' : 'pink'), '🔊 Thử âm thanh');
      test.onclick = () => { g.soundTest(); setTimeout(() => this.render(true), 400); };
      asRow.appendChild(test);
      sh.body.appendChild(asRow);
      const packRow = (title, group) => {
        sh.body.appendChild(el('div', 'note', `<b>${title}</b>`));
        const rd = el('div', 'radio');
        D.PACKS.filter((p) => (p.group === 'key') === group).forEach((p) => {
          const c = el('button', 'chip' + (st.pack === p.id ? ' on' : ''), p.name);
          c.onclick = () => { g.setPack(p.id); this.render(true); };
          rd.appendChild(c);
        });
        sh.body.appendChild(rd);
      };
      packRow('⌨️ Tiếng bàn phím (mỗi bước chân là một lần gõ phím — bấm để nghe thử)', true);
      packRow('Âm thanh bước chân ASMR khác', false);
      sh.body.appendChild(el('div', 'note', 'Phím dài (Shift, Enter, Caps, Tab) nghe trầm hơn và có tiếng rung thanh cân bằng; mỗi phím có cao độ riêng.'));
      const typing = el('div', 'radio');
      [['⌨️ Tiếng gõ khi bấm phím điều khiển: Bật', true], ['Tắt', false]].forEach(([label, v]) => {
        const c = el('button', 'chip' + (st.typing !== false === v ? ' on' : ''), label);
        c.onclick = () => { g.setTyping(v); this.render(true); };
        typing.appendChild(c);
      });
      sh.body.appendChild(typing);
      const slider = (label, min, max, step, val, fn) => {
        const wrap = el('div', '', `<div class="note"><b>${label}</b></div>`);
        const r = el('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
        r.oninput = () => fn(parseFloat(r.value));
        wrap.appendChild(r);
        return wrap;
      };
      sh.body.appendChild(slider('Âm lượng', 0, 1, 0.05, st.vol, (v) => g.setVolume(v)));
      sh.body.appendChild(slider('Độ nhạy camera', 0.3, 2.5, 0.1, st.sens, (v) => g.setSens(v)));
      const rd2 = el('div', 'radio');
      [['Bóng đổ: Bật', true], ['Bóng đổ: Tắt (nhẹ máy)', false]].forEach(([label, v]) => {
        const c = el('button', 'chip' + (st.shadows === v ? ' on' : ''), label);
        c.onclick = () => { g.setShadows(v); this.render(true); };
        rd2.appendChild(c);
      });
      sh.body.appendChild(el('div', 'note', '<b>Đồ hoạ</b>'));
      sh.body.appendChild(rd2);
      sh.body.appendChild(el('div', 'note', '<b>Điều khiển</b>'));
      const k = el('div', 'keys');
      k.innerHTML = '<kbd>W A S D</kbd><span>Di chuyển (hoặc phím mũi tên)</span><kbd>Space</kbd><span>Nhảy</span><kbd>Kéo chuột</kbd><span>Xoay camera</span><kbd>I / O</kbd><span>Zoom vào / ra (hoặc lăn chuột)</span><kbd>Tab</kbd><span>Bảng xếp hạng</span><kbd>B R T</kbd><span>Shop · Rebirth · Stages</span><kbd>Esc</kbd><span>Cài đặt / đóng bảng</span>';
      sh.body.appendChild(k);
      const row = el('div', 'row');
      const help = el('button', 'btn', '❓ Hướng dẫn');
      help.onclick = () => this.show('help');
      const reset = el('button', 'btn red', '🗑 Xoá tiến trình');
      let armed = false;
      reset.onclick = () => {
        // xác nhận ngay trong trang (confirm() bị chặn trong khung artifact)
        if (!armed) {
          armed = true;
          reset.textContent = 'Bấm lần nữa để xoá hết';
          setTimeout(() => { armed = false; reset.textContent = '🗑 Xoá tiến trình'; }, 4000);
          return;
        }
        g.resetSave();
      };
      row.appendChild(help);
      row.appendChild(reset);
      sh.body.appendChild(row);
      return sh;
    }

    // ---- Leaderboard
    renderBoard() {
      const g = this.g;
      const sh = this.shell('📋 Bảng xếp hạng server', '#ffe27a', '#f59e0b');
      const rows = g.leaderboard();
      const hd = el('div', 'lbrow hd', '<span>#</span><span>Người chơi</span><span>Speed</span><span>Wins</span>');
      sh.body.appendChild(hd);
      rows.forEach((r, i) => {
        const d = el('div', 'lbrow' + (r.me ? ' me' : ''), `<span>${i + 1}</span><span>${r.name}${r.me ? ' (bạn)' : ' · bot'}</span><span>${U.fmt(r.speed)}</span><span>${U.fmt(r.wins)}</span>`);
        sh.body.appendChild(d);
      });
      sh.body.appendChild(el('div', 'note', 'Bản này chơi một mình — các tên khác là bot mô phỏng để giống không khí server của game gốc.'));
      return sh;
    }

    // ---- Help
    renderHelp() {
      const sh = this.shell('❓ Cách chơi', '#6df0b0', '#1fb877');
      sh.body.innerHTML = `
        <div class="note" style="font-size:16px;opacity:1">
        <p><b>Mục tiêu:</b> chạy trên bàn phím kẹo khổng lồ — <b>mỗi bước chân = +Speed</b>. Speed càng cao bạn chạy càng nhanh, nhảy càng xa, và vượt được các stage khó hơn.</p>
        <p>🏃 Đứng trên <b>treadmill</b> (lobby / đầu mỗi stage) để cày Speed khi chạy tại chỗ.<br>
        🏁 Đi hết stage, chạm <b>bệ vàng WIN</b> để nhận Wins (+1 → +25.000) rồi bị đưa về Spawn.<br>
        🛒 Dùng Wins mua <b>Step Power</b>, <b>Treadmill</b>, <b>Trails</b>, <b>Auras</b> để nhân Speed mỗi bước.<br>
        🔄 Đạt Level yêu cầu để <b>Rebirth</b>: reset Speed nhưng nhận hệ số nhân vĩnh viễn.<br>
        ⚠️ Cẩn thận: khe nhảy dài dần, cầu <b>biến mất</b>, sàn di động, thanh quay, <b>Brainrot</b> đuổi, và <b>tia laser</b> (nấp sau khối lớn!). Rơi xuống biển chocolate sẽ về checkpoint gần nhất.<br>
        💡 Speed quá cao thì rất khó dừng — hãy <b>bấm nhẹ phím di chuyển</b> khi hạ cánh trên phím nhỏ.</p>
        <p style="font-size:13px;opacity:.75">Bản fan-made không chính thức, không liên kết với SecretVerse Studio hay Roblox.</p>
        </div>`;
      const b = el('button', 'btn pink', 'Bắt đầu chơi!');
      b.style.width = '100%';
      b.style.fontSize = '22px';
      b.onclick = () => this.close();
      sh.body.appendChild(b);
      return sh;
    }
  }

  SKE.UI = UI;
})();
