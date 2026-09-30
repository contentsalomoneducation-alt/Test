'use strict';
// Máy chủ không phụ thuộc thư viện ngoài: http + crypto + node:sqlite (Node >= 22.13).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Tax = require('./public/tax.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 30;
const COOKIE = 'sid';
const MAX_BODY = 100 * 1024;
const REGISTER_LIMIT = Number(process.env.REGISTER_LIMIT) || 10;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pass_salt TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    gross INTEGER NOT NULL,
    exempt INTEGER NOT NULL,
    dependents INTEGER NOT NULL,
    has_ins INTEGER NOT NULL,
    ins_salary INTEGER,
    ins INTEGER NOT NULL,
    taxable INTEGER NOT NULL,
    tax INTEGER NOT NULL,
    net INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, month)
  );
`);

// ---------- Tiện ích ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(password, salt, 64).toString('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      return reject(new HttpError(415, 'Cần Content-Type: application/json'));
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Dữ liệu quá lớn'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch {
        reject(new HttpError(400, 'JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Sau proxy (Render, Railway, Nginx…) đặt TRUST_PROXY=1 để lấy IP thật của người dùng.
// Lấy phần tử cuối của X-Forwarded-For: đó là IP do chính proxy tin cậy ghi thêm, client không giả được.
function clientIp(req) {
  if (process.env.TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || '';
}

const isSecure = (req) => process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';

function setSessionCookie(req, token, maxAgeSec) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${isSecure(req) ? '; Secure' : ''}`;
}

function createSession(req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return setSessionCookie(req, token, SESSION_DAYS * 86400);
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.settings, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .get(sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return row;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, settings: { ...Tax.DEFAULT_SETTINGS, ...JSON.parse(u.settings || '{}') } });

// Giới hạn số lần đăng nhập/đăng ký sai (theo IP + email) để chống dò mật khẩu.
const attempts = new Map();
function throttle(key, limit = 8, windowMs = 15 * 60_000) {
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (rec.length >= limit) throw new HttpError(429, 'Thử quá nhiều lần, vui lòng đợi ít phút rồi thử lại');
  rec.push(now);
  attempts.set(key, rec);
}
setInterval(() => attempts.clear(), 60 * 60_000).unref();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function cleanSettings(input) {
  const out = {};
  for (const k of Object.keys(Tax.DEFAULT_SETTINGS)) {
    const v = Number(input?.[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1e12) throw new HttpError(400, `Giá trị "${k}" không hợp lệ`);
    out[k] = Math.round(v);
  }
  return out;
}

const rowToRecord = (r) => ({
  month: r.month,
  gross: r.gross,
  exempt: r.exempt,
  dependents: r.dependents,
  hasIns: !!r.has_ins,
  insSalary: r.ins_salary,
  ins: r.ins,
  taxable: r.taxable,
  tax: r.tax,
  net: r.net,
  note: r.note,
  updatedAt: r.updated_at,
});

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const ip = clientIp(req);

  if (route === 'POST /api/register') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 80);
    const password = String(b.password || '');
    throttle(`reg:${ip}`, REGISTER_LIMIT);
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Email không hợp lệ');
    if (!name) throw new HttpError(400, 'Vui lòng nhập tên');
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Mật khẩu cần từ 8 ký tự');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Email này đã được đăng ký');
    const { salt, hash } = hashPassword(password);
    const info = db.prepare('INSERT INTO users (email, name, pass_salt, pass_hash) VALUES (?, ?, ?, ?)').run(email, name, salt, hash);
    const cookie = createSession(req, Number(info.lastInsertRowid));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    return send(res, 201, { user: publicUser(user) }, { 'Set-Cookie': cookie });
  }

  if (route === 'POST /api/login') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    throttle(`login:${ip}:${email}`);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Luôn băm mật khẩu để thời gian phản hồi không lộ email có tồn tại hay không.
    const ok = user ? verifyPassword(password, user.pass_salt, user.pass_hash) : (hashPassword(password), false);
    if (!ok) throw new HttpError(401, 'Email hoặc mật khẩu không đúng');
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': createSession(req, user.id) });
  }

  if (route === 'POST /api/logout') {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return send(res, 200, { ok: true }, { 'Set-Cookie': setSessionCookie(req, '', 0) });
  }

  if (route === 'GET /api/me') {
    const u = currentUser(req);
    return send(res, 200, { user: u ? publicUser(u) : null });
  }

  // Các API dưới đây cần đăng nhập
  const user = currentUser(req);
  if (!user) throw new HttpError(401, 'Bạn cần đăng nhập');
  const settings = { ...Tax.DEFAULT_SETTINGS, ...JSON.parse(user.settings || '{}') };

  if (route === 'PUT /api/settings') {
    const s = cleanSettings(await readJson(req));
    db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(s), user.id);
    return send(res, 200, { settings: s });
  }

  if (route === 'POST /api/password') {
    const b = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    throttle(`pw:${user.id}`);
    if (!verifyPassword(String(b.current || ''), row.pass_salt, row.pass_hash)) throw new HttpError(401, 'Mật khẩu hiện tại không đúng');
    const next = String(b.next || '');
    if (next.length < 8 || next.length > 200) throw new HttpError(400, 'Mật khẩu mới cần từ 8 ký tự');
    const { salt, hash } = hashPassword(next);
    db.prepare('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?').run(salt, hash, user.id);
    // Đăng xuất các thiết bị khác, giữ phiên hiện tại.
    const keep = sha256(parseCookies(req.headers.cookie)[COOKIE]);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, keep);
    return send(res, 200, { ok: true });
  }

  if (route === 'GET /api/records') {
    const year = url.searchParams.get('year');
    const rows = year && /^\d{4}$/.test(year)
      ? db.prepare('SELECT * FROM records WHERE user_id = ? AND month LIKE ? ORDER BY month').all(user.id, `${year}-%`)
      : db.prepare('SELECT * FROM records WHERE user_id = ? ORDER BY month').all(user.id);
    return send(res, 200, { records: rows.map(rowToRecord) });
  }

  const m = url.pathname.match(/^\/api\/records\/(\d{4}-\d{2})$/);
  if (m) {
    const month = m[1];
    if (!MONTH_RE.test(month)) throw new HttpError(400, 'Tháng không hợp lệ (dùng YYYY-MM)');

    if (req.method === 'PUT') {
      const b = await readJson(req);
      // Máy chủ tự tính lại toàn bộ, không tin số liệu kết quả từ máy khách.
      const r = Tax.calculate(b, settings);
      const note = String(b.note || '').trim().slice(0, 200);
      const insSalary = b.insSalary == null || b.insSalary === '' ? null : Math.round(Number(b.insSalary)) || 0;
      db.prepare(
        `INSERT INTO records (user_id, month, gross, exempt, dependents, has_ins, ins_salary, ins, taxable, tax, net, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, month) DO UPDATE SET
           gross = excluded.gross, exempt = excluded.exempt, dependents = excluded.dependents,
           has_ins = excluded.has_ins, ins_salary = excluded.ins_salary, ins = excluded.ins,
           taxable = excluded.taxable, tax = excluded.tax, net = excluded.net,
           note = excluded.note, updated_at = datetime('now')`
      ).run(user.id, month, r.gross, r.exempt, r.dependents, r.hasIns ? 1 : 0, insSalary, r.ins, r.taxable, r.tax, r.net, note);
      const row = db.prepare('SELECT * FROM records WHERE user_id = ? AND month = ?').get(user.id, month);
      return send(res, 200, { record: rowToRecord(row) });
    }

    if (req.method === 'DELETE') {
      const info = db.prepare('DELETE FROM records WHERE user_id = ? AND month = ?').run(user.id, month);
      if (!info.changes) throw new HttpError(404, 'Không tìm thấy bản ghi');
      return send(res, 200, { ok: true });
    }
  }

  if (route === 'DELETE /api/account') {
    const b = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(b.password || ''), row.pass_salt, row.pass_hash)) throw new HttpError(401, 'Mật khẩu không đúng');
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    return send(res, 200, { ok: true }, { 'Set-Cookie': setSessionCookie(req, '', 0) });
  }

  throw new HttpError(404, 'Không tìm thấy API');
}

// ---------- File tĩnh ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, 'Đường dẫn không hợp lệ');
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Forbidden');
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new HttpError(404, 'Không tìm thấy trang');
  }
  if (!stat.isFile()) throw new HttpError(404, 'Không tìm thấy trang');
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
  );
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      await handleApi(req, res, url);
    } else serveStatic(req, res, url);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: 'Lỗi máy chủ' });
  }
});

// Dọn phiên hết hạn mỗi giờ.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600_000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Đang chạy tại http://localhost:${PORT}`));
}

module.exports = { server, db };
