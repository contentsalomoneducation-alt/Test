'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN') + ' ₫';
  const parseMoney = (s) => Number(String(s).replace(/\D/g, '').slice(0, 13)) || 0;
  const pct = (v) => (v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%';
  const compact = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr' : Math.round(n / 1e3) + 'k');
  const monthLabel = (m) => `Tháng ${m.slice(5)}/${m.slice(0, 4)}`;
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  const state = {
    user: null,
    settings: { ...Tax.DEFAULT_SETTINGS },
    records: [],
    year: new Date().getFullYear(),
    authMode: 'login',
    pendingSave: false,
  };

  // ---------- Tiện ích DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }
  const svg = (tag, attrs, ...kids) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    for (const kid of kids) if (kid) el.append(kid);
    return el;
  };

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- Ô nhập tiền ----------
  function setMoney(el, n) {
    el.value = n ? Number(n).toLocaleString('vi-VN') : '';
  }
  function formatMoneyInput(el) {
    const pos = el.selectionStart ?? el.value.length;
    const digitsBefore = el.value.slice(0, pos).replace(/\D/g, '').length;
    const digits = el.value.replace(/\D/g, '').slice(0, 13).replace(/^0+(?=\d)/, '');
    el.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
    let count = 0;
    let i = 0;
    for (; i < el.value.length && count < digitsBefore; i++) if (/\d/.test(el.value[i])) count++;
    try { el.setSelectionRange(i, i); } catch { /* một số kiểu input không hỗ trợ */ }
  }
  document.querySelectorAll('input[data-money]').forEach((el) =>
    el.addEventListener('input', () => {
      formatMoneyInput(el);
      if (el.closest('#form')) renderCalc();
    })
  );

  // ---------- Tính thuế ----------
  function formInput() {
    const ins = $('insSalary').value.trim();
    return {
      gross: parseMoney($('gross').value),
      exempt: parseMoney($('exempt').value),
      dependents: Math.max(0, Math.min(50, Math.floor(Number($('dependents').value) || 0))),
      hasIns: $('hasIns').checked,
      insSalary: ins ? parseMoney(ins) : null,
    };
  }

  const line = (label, value, cls = '') => h('div', { class: 'line ' + cls }, h('span', {}, label), h('span', {}, value));

  function renderCalc() {
    const r = Tax.calculate(formInput(), state.settings);
    $('insField').hidden = !$('hasIns').checked;
    $('outTax').textContent = fmt(r.tax);
    $('outNet').textContent = fmt(r.net);
    $('outRate').textContent = r.gross ? `Bằng ${pct(r.tax / r.gross)} tổng thu nhập` : '';
    $('outNetPct').textContent = r.gross ? `Bằng ${pct(r.net / r.gross)} tổng thu nhập` : '';

    $('breakdown').replaceChildren(
      line('Tổng thu nhập', fmt(r.gross)),
      line('− Khoản không chịu thuế', fmt(r.exempt), 'sub'),
      line('− Bảo hiểm bắt buộc', fmt(r.ins), 'sub'),
      line('− Giảm trừ bản thân', fmt(r.selfDed), 'sub'),
      line(`− Giảm trừ người phụ thuộc (${r.dependents})`, fmt(r.depTotal), 'sub'),
      line('Thu nhập tính thuế', fmt(r.taxable), 'total'),
      line('Thuế TNCN', fmt(r.tax), 'total')
    );

    const maxTax = Math.max(1, ...r.parts.map((p) => p.tax));
    $('brackets').replaceChildren(
      ...r.parts.map((p) => {
        const range = p.upTo === Infinity ? `Trên ${p.from / 1e6} triệu` : `${p.from / 1e6} – ${p.upTo / 1e6} triệu`;
        return h(
          'div',
          { class: 'brk' + (p.tax ? '' : ' zero') },
          h('span', {}, `${range} · ${Math.round(p.rate * 100)}%`),
          h('b', {}, fmt(p.tax)),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${(p.tax / maxTax) * 100}%` }))
        );
      })
    );
    updateSaveState();
  }

  function existingRecord() {
    return state.records.find((r) => r.month === $('month').value);
  }

  function updateSaveState() {
    const rec = existingRecord();
    const note = $('monthNote');
    if (state.user && rec) {
      note.hidden = false;
      note.textContent = 'Tháng này đã có dữ liệu, lưu sẽ ghi đè.';
      $('saveBtn').textContent = `Cập nhật ${monthLabel(rec.month).toLowerCase()}`;
    } else {
      note.hidden = true;
      $('saveBtn').textContent = state.user ? 'Lưu vào lịch sử' : 'Đăng nhập để lưu';
    }
  }

  function fillForm(rec) {
    $('month').value = rec.month;
    setMoney($('gross'), rec.gross);
    setMoney($('exempt'), rec.exempt);
    $('dependents').value = rec.dependents;
    $('hasIns').checked = rec.hasIns;
    setMoney($('insSalary'), rec.insSalary);
    $('note').value = rec.note || '';
    renderCalc();
  }

  function resetForm() {
    ['gross', 'exempt', 'insSalary', 'note'].forEach((id) => ($(id).value = ''));
    $('dependents').value = 0;
    $('hasIns').checked = true;
    renderCalc();
  }

  $('form').addEventListener('input', (e) => {
    if (!e.target.matches('[data-money]')) renderCalc();
  });
  $('month').addEventListener('change', () => {
    if (!/^\d{4}-\d{2}$/.test($('month').value)) $('month').value = thisMonth();
    const rec = existingRecord();
    if (state.user && rec) fillForm(rec);
    else updateSaveState();
  });
  $('depMinus').addEventListener('click', () => {
    $('dependents').value = Math.max(0, (Number($('dependents').value) || 0) - 1);
    renderCalc();
  });
  $('depPlus').addEventListener('click', () => {
    $('dependents').value = Math.min(50, (Number($('dependents').value) || 0) + 1);
    renderCalc();
  });
  $('resetBtn').addEventListener('click', resetForm);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) {
      state.pendingSave = true;
      return openAuth('login');
    }
    await saveRecord();
  });

  async function saveRecord() {
    const input = formInput();
    if (!input.gross) return toast('Hãy nhập tổng thu nhập');
    const month = $('month').value;
    $('saveBtn').disabled = true;
    try {
      const { record } = await api(`/records/${month}`, { method: 'PUT', body: { ...input, note: $('note').value } });
      const i = state.records.findIndex((r) => r.month === month);
      if (i >= 0) state.records[i] = record;
      else state.records.push(record);
      state.records.sort((a, b) => a.month.localeCompare(b.month));
      state.year = Number(month.slice(0, 4));
      toast(`Đã lưu ${monthLabel(month).toLowerCase()}`);
      updateSaveState();
      renderHistory();
    } catch (err) {
      if (err.status === 401) { state.user = null; renderUser(); openAuth('login'); }
      toast(err.message);
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  // ---------- Tabs ----------
  function showTab(tab) {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('view-calc').hidden = tab !== 'calc';
    $('view-history').hidden = tab !== 'history';
    if (tab === 'history') renderHistory();
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- Lịch sử ----------
  function renderHistory() {
    $('historyGate').hidden = !!state.user;
    $('historyBody').hidden = !state.user;
    if (!state.user) return;

    const years = [...new Set([new Date().getFullYear(), ...state.records.map((r) => Number(r.month.slice(0, 4)))])].sort((a, b) => b - a);
    if (!years.includes(state.year)) state.year = years[0];
    $('yearSel').replaceChildren(...years.map((y) => h('option', { value: y, ...(y === state.year ? { selected: '' } : {}) }, `Năm ${y}`)));

    const recs = state.records.filter((r) => r.month.startsWith(state.year + '-'));
    const sum = (k) => recs.reduce((s, r) => s + r[k], 0);
    const gross = sum('gross');
    const stat = (cls, label, value) => h('div', { class: 'kpi ' + cls }, h('small', {}, label), h('strong', {}, value));
    $('yearStats').replaceChildren(
      stat('', 'Số tháng đã lưu', String(recs.length)),
      stat('', 'Tổng thu nhập', fmt(gross)),
      stat('tax', 'Tổng thuế', fmt(sum('tax'))),
      stat('net', 'Tổng thực nhận', fmt(sum('net')))
    );

    renderChart(recs);
    const list = $('recordList');
    if (!recs.length) {
      list.replaceChildren(h('p', { class: 'empty' }, `Chưa có dữ liệu năm ${state.year}. Vào tab Tính thuế và bấm “Lưu vào lịch sử”.`));
      return;
    }
    list.replaceChildren(
      ...[...recs].reverse().map((r) => {
        const num = (label, v) => h('div', {}, h('small', {}, label), fmt(v));
        return h(
          'div',
          { class: 'rec' },
          h('div', { class: 'm' }, `${r.month.slice(5)}/${r.month.slice(0, 4)}`),
          h('div', { class: 'nums' }, num('Thu nhập', r.gross), num('Thuế', r.tax), num('Thực nhận', r.net)),
          h(
            'div',
            { class: 'btns' },
            h('button', { class: 'btn ghost small', onclick: () => editRecord(r.month) }, 'Sửa'),
            h('button', { class: 'btn danger small', onclick: () => deleteRecord(r.month) }, 'Xóa')
          ),
          r.note ? h('div', { class: 'note' }, r.note) : null
        );
      })
    );
  }

  function renderChart(recs) {
    const W = 720, H = 260, L = 52, R = 8, T = 22, B = 28;
    const byMonth = new Map(recs.map((r) => [Number(r.month.slice(5)), r]));
    const totals = recs.map((r) => r.net + r.tax);
    const max = Math.max(1, ...totals);
    const pow = 10 ** Math.floor(Math.log10(max));
    const niceMax = Math.ceil(max / (pow / 2)) * (pow / 2);
    const ph = H - T - B;
    const y = (v) => T + ph - (v / niceMax) * ph;
    const colW = (W - L - R) / 12;
    const bw = Math.min(30, colW * 0.6);

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Biểu đồ thuế và thực nhận theo tháng năm ${state.year}` });
    for (let i = 0; i <= 4; i++) {
      const v = (niceMax / 4) * i;
      root.append(
        svg('line', { class: 'grid-line', x1: L, x2: W - R, y1: y(v), y2: y(v) }),
        Object.assign(svg('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }), { textContent: v ? compact(v) : '0' })
      );
    }
    for (let m = 1; m <= 12; m++) {
      const cx = L + colW * (m - 0.5);
      root.append(Object.assign(svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }), { textContent: 'T' + m }));
      const r = byMonth.get(m);
      if (!r) continue;
      const netH = (r.net / niceMax) * ph;
      const taxH = (r.tax / niceMax) * ph;
      const g = svg('g', {});
      g.append(
        Object.assign(svg('title', {}), { textContent: `${monthLabel(r.month)}: thuế ${fmt(r.tax)}, thực nhận ${fmt(r.net)}` }),
        svg('rect', { class: 'b-net', x: cx - bw / 2, y: y(r.net), width: bw, height: netH, rx: 3 }),
        r.tax ? svg('rect', { class: 'b-tax', x: cx - bw / 2, y: y(r.net) - taxH, width: bw, height: Math.max(taxH, 2), rx: 2 }) : null,
        r.tax ? Object.assign(svg('text', { x: cx, y: y(r.net) - taxH - 5, 'text-anchor': 'middle' }), { textContent: compact(r.tax) }) : null,
        svg('rect', { class: 'hit', x: cx - colW / 2, y: T, width: colW, height: ph })
      );
      g.addEventListener('click', () => editRecord(r.month));
      root.append(g);
    }
    $('chart').replaceChildren(root);
  }

  function editRecord(month) {
    const rec = state.records.find((r) => r.month === month);
    if (!rec) return;
    fillForm(rec);
    showTab('calc');
  }

  async function deleteRecord(month) {
    if (!confirm(`Xóa dữ liệu ${monthLabel(month).toLowerCase()}?`)) return;
    try {
      await api(`/records/${month}`, { method: 'DELETE' });
      state.records = state.records.filter((r) => r.month !== month);
      toast('Đã xóa');
      renderHistory();
      updateSaveState();
    } catch (err) {
      toast(err.message);
    }
  }

  $('yearSel').addEventListener('change', () => {
    state.year = Number($('yearSel').value);
    renderHistory();
  });

  $('csvBtn').addEventListener('click', () => {
    const recs = state.records.filter((r) => r.month.startsWith(state.year + '-'));
    if (!recs.length) return toast('Chưa có dữ liệu để xuất');
    // Chặn CSV injection: ô bắt đầu bằng = + - @ sẽ được thêm dấu nháy đơn.
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [['Tháng', 'Tổng thu nhập', 'Không chịu thuế', 'Người phụ thuộc', 'Bảo hiểm', 'Thu nhập tính thuế', 'Thuế TNCN', 'Thực nhận', 'Ghi chú']];
    for (const r of recs) rows.push([r.month, r.gross, r.exempt, r.dependents, r.ins, r.taxable, r.tax, r.net, r.note]);
    const csv = '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `thue-tncn-${state.year}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- Tài khoản ----------
  function renderUser() {
    const area = $('userArea');
    if (!state.user) {
      area.replaceChildren(h('button', { class: 'btn primary small', onclick: () => openAuth('login') }, 'Đăng nhập'));
    } else {
      area.replaceChildren(
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, [...state.user.name][0]?.toUpperCase() || '?'),
        h('span', { class: 'who' }, state.user.name),
        h('button', { class: 'btn ghost small', onclick: openSettings }, 'Cài đặt'),
        h('button', { class: 'btn ghost small', onclick: logout }, 'Đăng xuất')
      );
    }
    updateSaveState();
    renderHistory();
  }

  function applyUser(user) {
    state.user = user;
    state.settings = user ? { ...Tax.DEFAULT_SETTINGS, ...user.settings } : { ...Tax.DEFAULT_SETTINGS };
  }

  async function loadRecords() {
    try {
      state.records = (await api('/records')).records;
      const latest = state.records[state.records.length - 1];
      if (latest) state.year = Number(latest.month.slice(0, 4));
    } catch {
      state.records = [];
    }
  }

  function openAuth(mode) {
    state.authMode = mode;
    const reg = mode === 'register';
    $('authTitle').textContent = reg ? 'Tạo tài khoản' : 'Đăng nhập';
    $('authSubmit').textContent = reg ? 'Tạo tài khoản' : 'Đăng nhập';
    $('nameField').hidden = !reg;
    $('authName').required = reg;
    $('authPass').autocomplete = reg ? 'new-password' : 'current-password';
    $('passHint').textContent = reg ? 'tối thiểu 8 ký tự' : '';
    $('authSwitchText').textContent = reg ? 'Đã có tài khoản?' : 'Chưa có tài khoản?';
    $('authSwitch').textContent = reg ? 'Đăng nhập' : 'Tạo tài khoản';
    $('authErr').hidden = true;
    if (!$('authDlg').open) $('authDlg').showModal();
  }
  $('authSwitch').addEventListener('click', () => openAuth(state.authMode === 'login' ? 'register' : 'login'));
  document.querySelectorAll('[data-open-auth]').forEach((b) => b.addEventListener('click', () => openAuth(b.dataset.openAuth)));

  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reg = state.authMode === 'register';
    $('authSubmit').disabled = true;
    $('authErr').hidden = true;
    try {
      const body = { email: $('authEmail').value, password: $('authPass').value };
      if (reg) body.name = $('authName').value;
      const { user } = await api(reg ? '/register' : '/login', { method: 'POST', body });
      applyUser(user);
      await loadRecords();
      $('authPass').value = '';
      $('authDlg').close();
      renderUser();
      renderCalc();
      toast(`Xin chào, ${user.name}`);
      if (state.pendingSave) {
        state.pendingSave = false;
        await saveRecord();
      }
    } catch (err) {
      $('authErr').textContent = err.message;
      $('authErr').hidden = false;
    } finally {
      $('authSubmit').disabled = false;
    }
  });

  async function logout() {
    try { await api('/logout', { method: 'POST' }); } catch { /* bỏ qua */ }
    applyUser(null);
    state.records = [];
    renderUser();
    renderCalc();
    toast('Đã đăng xuất');
  }

  // ---------- Cài đặt ----------
  function fillSettings(s) {
    setMoney($('setSelf'), s.selfDed);
    setMoney($('setDep'), s.depDed);
    setMoney($('setSI'), s.capSI);
    setMoney($('setUI'), s.capUI);
  }
  function openSettings() {
    fillSettings(state.settings);
    $('settingsErr').hidden = true;
    ['pwCur', 'pwNew', 'delPass'].forEach((id) => ($(id).value = ''));
    $('settingsDlg').showModal();
  }
  $('settingsDefault').addEventListener('click', () => fillSettings(Tax.DEFAULT_SETTINGS));

  function settingsError(msg) {
    $('settingsErr').textContent = msg;
    $('settingsErr').hidden = false;
  }

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('settingsErr').hidden = true;
    try {
      const { settings } = await api('/settings', {
        method: 'PUT',
        body: { selfDed: parseMoney($('setSelf').value), depDed: parseMoney($('setDep').value), capSI: parseMoney($('setSI').value), capUI: parseMoney($('setUI').value) },
      });
      state.settings = settings;
      state.user.settings = settings;
      renderCalc();
      $('settingsDlg').close();
      toast('Đã lưu cài đặt');
    } catch (err) {
      settingsError(err.message);
    }
  });

  $('pwBtn').addEventListener('click', async () => {
    $('settingsErr').hidden = true;
    try {
      await api('/password', { method: 'POST', body: { current: $('pwCur').value, next: $('pwNew').value } });
      $('pwCur').value = $('pwNew').value = '';
      toast('Đã đổi mật khẩu');
    } catch (err) {
      settingsError(err.message);
    }
  });

  $('delBtn').addEventListener('click', async () => {
    $('settingsErr').hidden = true;
    if (!$('delPass').value) return settingsError('Nhập mật khẩu để xác nhận');
    if (!confirm('Xóa vĩnh viễn tài khoản và toàn bộ lịch sử?')) return;
    try {
      await api('/account', { method: 'DELETE', body: { password: $('delPass').value } });
      $('settingsDlg').close();
      applyUser(null);
      state.records = [];
      renderUser();
      renderCalc();
      toast('Đã xóa tài khoản');
    } catch (err) {
      settingsError(err.message);
    }
  });

  // Đóng hộp thoại: nút × hoặc bấm ra ngoài
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  });

  // ---------- Khởi động ----------
  async function init() {
    $('month').value = thisMonth();
    renderCalc();
    try {
      const { user } = await api('/me');
      applyUser(user);
      if (user) await loadRecords();
    } catch { /* chạy chế độ khách */ }
    renderUser();
    renderCalc();
  }
  init();
})();
