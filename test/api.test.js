'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.REGISTER_LIMIT = '1000';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thue-'));
const { server, db } = require('../server.js');
const Tax = require('../public/tax.js');

let base;
before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, json, text, cookie: setCookie ? setCookie.split(';')[0] : null, setCookie };
}

async function signup(email, name = 'Người dùng') {
  const r = await call('POST', '/api/register', { email, name, password: 'matkhau-dai-123' });
  assert.equal(r.status, 201);
  return r.cookie;
}

test('tính thuế: khớp ví dụ đã kiểm tra tay', () => {
  const a = Tax.calculate({ gross: 30_000_000, hasIns: true, dependents: 0 });
  assert.equal(a.ins, 3_150_000);
  assert.equal(a.taxable, 11_350_000);
  assert.equal(a.tax, 635_000);
  assert.equal(a.net, 26_215_000);
  const b = Tax.calculate({ gross: 50_000_000, hasIns: true, dependents: 1 });
  assert.equal(b.ins, 4_946_000);
  assert.equal(b.tax, 1_835_400);
  const low = Tax.calculate({ gross: 10_000_000, hasIns: false });
  assert.equal(low.tax, 0);
  assert.equal(Tax.calculate({ gross: -5, dependents: -3 }).gross, 0);
});

test('đăng ký, /me, đăng xuất, đăng nhập lại', async () => {
  const r = await call('POST', '/api/register', { email: 'A@Example.com', name: 'An', password: 'matkhau-dai-123' });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  assert.equal(r.json.user.email, 'a@example.com');
  assert.equal('pass_hash' in r.json.user, false);

  const me = await call('GET', '/api/me', null, r.cookie);
  assert.equal(me.json.user.name, 'An');

  await call('POST', '/api/logout', null, r.cookie);
  assert.equal((await call('GET', '/api/me', null, r.cookie)).json.user, null);

  const again = await call('POST', '/api/login', { email: 'a@example.com', password: 'matkhau-dai-123' });
  assert.equal(again.status, 200);
  const bad = await call('POST', '/api/login', { email: 'a@example.com', password: 'sai-mat-khau' });
  assert.equal(bad.status, 401);
});

test('đăng ký: kiểm tra đầu vào và trùng email', async () => {
  assert.equal((await call('POST', '/api/register', { email: 'khong-hop-le', name: 'x', password: 'matkhau-dai-123' })).status, 400);
  assert.equal((await call('POST', '/api/register', { email: 'b@example.com', name: 'x', password: 'ngan' })).status, 400);
  await signup('dup@example.com');
  assert.equal((await call('POST', '/api/register', { email: 'DUP@example.com', name: 'x', password: 'matkhau-dai-123' })).status, 409);
});

test('mật khẩu không lưu dạng rõ', () => {
  const row = db.prepare("SELECT pass_hash, pass_salt FROM users WHERE email = 'a@example.com'").get();
  assert.ok(row.pass_hash.length === 128 && !row.pass_hash.includes('matkhau'));
});

test('bản ghi: cần đăng nhập, máy chủ tự tính lại, ghi đè theo tháng', async () => {
  assert.equal((await call('GET', '/api/records')).status, 401);
  assert.equal((await call('PUT', '/api/records/2026-03', { gross: 1 })).status, 401);

  const c = await signup('rec@example.com');
  // Máy khách cố gửi số thuế giả: phải bị bỏ qua.
  const put = await call('PUT', '/api/records/2026-03', { gross: 30_000_000, hasIns: true, dependents: 0, tax: 1, net: 999_999_999, note: 'thử' }, c);
  assert.equal(put.status, 200);
  assert.equal(put.json.record.tax, 635_000);
  assert.equal(put.json.record.net, 26_215_000);

  await call('PUT', '/api/records/2026-03', { gross: 50_000_000, hasIns: true, dependents: 1 }, c);
  const list = await call('GET', '/api/records', null, c);
  assert.equal(list.json.records.length, 1);
  assert.equal(list.json.records[0].tax, 1_835_400);

  assert.equal((await call('PUT', '/api/records/2026-13', { gross: 1 }, c)).status, 400);
  assert.equal((await call('DELETE', '/api/records/2026-03', null, c)).status, 200);
  assert.equal((await call('DELETE', '/api/records/2026-03', null, c)).status, 404);
});

test('cách ly dữ liệu giữa hai người dùng', async () => {
  const u1 = await signup('u1@example.com');
  const u2 = await signup('u2@example.com');
  await call('PUT', '/api/records/2026-05', { gross: 20_000_000, hasIns: false }, u1);
  assert.equal((await call('GET', '/api/records', null, u2)).json.records.length, 0);
  assert.equal((await call('DELETE', '/api/records/2026-05', null, u2)).status, 404);
  assert.equal((await call('GET', '/api/records', null, u1)).json.records.length, 1);
});

test('cài đặt riêng ảnh hưởng tới kết quả tính lại', async () => {
  const c = await signup('set@example.com');
  const s = await call('PUT', '/api/settings', { selfDed: 11_000_000, depDed: 4_400_000, capSI: 46_800_000, capUI: 99_200_000 }, c);
  assert.equal(s.status, 200);
  const r = await call('PUT', '/api/records/2026-01', { gross: 20_000_000, hasIns: false }, c);
  assert.equal(r.json.record.taxable, 9_000_000);
  assert.equal((await call('PUT', '/api/settings', { selfDed: -1, depDed: 1, capSI: 1, capUI: 1 }, c)).status, 400);
});

test('đổi mật khẩu và xóa tài khoản', async () => {
  const c = await signup('pw@example.com');
  assert.equal((await call('POST', '/api/password', { current: 'sai', next: 'matkhau-moi-456' }, c)).status, 401);
  assert.equal((await call('POST', '/api/password', { current: 'matkhau-dai-123', next: 'matkhau-moi-456' }, c)).status, 200);
  assert.equal((await call('POST', '/api/login', { email: 'pw@example.com', password: 'matkhau-moi-456' })).status, 200);

  await call('PUT', '/api/records/2026-02', { gross: 1_000_000 }, c);
  assert.equal((await call('DELETE', '/api/account', { password: 'sai' }, c)).status, 401);
  assert.equal((await call('DELETE', '/api/account', { password: 'matkhau-moi-456' }, c)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE month = '2026-02' AND user_id NOT IN (SELECT id FROM users)").get().n, 0);
  assert.equal((await call('POST', '/api/login', { email: 'pw@example.com', password: 'matkhau-moi-456' })).status, 401);
});

test('chặn dò mật khẩu bằng giới hạn số lần thử', async () => {
  await signup('brute@example.com');
  let last;
  for (let i = 0; i < 10; i++) last = await call('POST', '/api/login', { email: 'brute@example.com', password: 'sai-' + i });
  assert.equal(last.status, 429);
});

test('yêu cầu JSON và giới hạn kích thước', async () => {
  const noType = await fetch(base + '/api/login', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(noType.status, 415);
  const big = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200_000) }) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
});

test('file tĩnh: phục vụ trang, chặn thoát thư mục và file nhạy cảm', async () => {
  const home = await call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /Thuế Tháng/);
  assert.equal((await call('GET', '/tax.js')).status, 200);
  for (const p of ['/../server.js', '/..%2fserver.js', '/%2e%2e/package.json', '/../data/app.db', '/nope.txt']) {
    const r = await fetch(base + p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
    const body = await r.text();
    assert.ok(!body.includes('DatabaseSync'), `${p} lộ mã nguồn`);
  }
});
