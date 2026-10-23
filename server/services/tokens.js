/* Đăng nhập bằng JWT:
   - Access token: JWT HS256 sống 15 phút, nằm trong cookie HttpOnly `mq_at` (Path=/).
     Chứa sub (id người dùng) và tv (token version). Đổi tv của người dùng → mọi access token cũ mất hiệu lực ngay.
   - Refresh token: chuỗi ngẫu nhiên 256 bit trong cookie HttpOnly `mq_rt` (SameSite=Strict, Path=/api/auth),
     máy chủ chỉ lưu bản băm SHA-256. Mỗi lần làm mới sẽ đổi sang token mới (xoay vòng).
     Nếu một token đã dùng bị đưa lại (dấu hiệu bị đánh cắp) → hủy cả chuỗi phiên đó. */
'use strict';
const crypto = require('node:crypto');
const jwt = require('../lib/jwt');
const { cookie, parseCookies } = require('../lib/http');

const ACCESS_COOKIE = 'mq_at';
const REFRESH_COOKIE = 'mq_rt';
const REUSE_GRACE_MS = 30000; // 2 tab làm mới cùng lúc: cho phép trong 30 giây, không coi là bị đánh cắp

const hashKey = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function createTokenService({ config, db, now }) {
  const secret = () => config.jwtSecret || db.data.secret;
  const audience = config.origin;

  function accessCookie(token) {
    // Cookie sống bằng refresh token để máy chủ phân biệt "hết hạn" với "chưa đăng nhập"; JWT bên trong vẫn chỉ 15 phút
    return cookie(ACCESS_COOKIE, token, { path: '/', sameSite: 'Lax', secure: config.https, maxAge: token ? config.refreshTtlSec : 0 });
  }
  function refreshCookie(token) {
    return cookie(REFRESH_COOKIE, token, { path: '/api/auth', sameSite: 'Strict', secure: config.https, maxAge: token ? config.refreshTtlSec : 0 });
  }
  function clearCookies() { return [accessCookie(''), refreshCookie('')]; }

  function signAccess(user) {
    return jwt.sign({ sub: user.id, tv: user.tokenVersion || 0, role: user.role }, secret(), {
      expiresIn: config.accessTtlSec, issuer: config.jwtIssuer, audience, now: now()
    });
  }

  // Cấp cặp token mới; family = chuỗi phiên của 1 thiết bị
  function issue(user, req, family) {
    const refresh = crypto.randomBytes(32).toString('base64url');
    db.data.refreshTokens[hashKey(refresh)] = {
      userId: user.id, family: family || crypto.randomUUID(), createdAt: now(),
      expiresAt: now() + config.refreshTtlSec * 1000, usedAt: null,
      ua: String((req && req.headers['user-agent']) || '').slice(0, 160)
    };
    return [accessCookie(signAccess(user)), refreshCookie(refresh)];
  }

  // Đọc người dùng từ access token. Trả về { user } hoặc { error: 'none' | 'expired' | 'invalid' }
  function authenticate(req) {
    const token = parseCookies(req)[ACCESS_COOKIE];
    if (!token) return { error: 'none' };
    let claims;
    try {
      claims = jwt.verify(token, secret(), { issuer: config.jwtIssuer, audience, now: now() });
    } catch (e) {
      return { error: e.code === 'expired' ? 'expired' : 'invalid' };
    }
    const user = db.data.users[claims.sub];
    if (!user || !user.active || (user.tokenVersion || 0) !== claims.tv) return { error: 'invalid' };
    return { user, claims };
  }

  // Làm mới: trả về { cookies, user } hoặc { status, code }
  function refresh(req) {
    const token = parseCookies(req)[REFRESH_COOKIE];
    if (!token) return { status: 401, code: 'no_refresh' };
    const key = hashKey(token);
    const rec = db.data.refreshTokens[key];
    if (!rec || rec.expiresAt <= now()) return { status: 401, code: 'expired' };
    if (rec.usedAt) {
      if (now() - rec.usedAt < REUSE_GRACE_MS) return { status: 409, code: 'retry' };
      // Token cũ bị dùng lại: có thể đã lộ → hủy cả chuỗi phiên của thiết bị này
      revokeFamily(rec.family);
      db.save();
      return { status: 401, code: 'reused' };
    }
    const user = db.data.users[rec.userId];
    if (!user || !user.active) {
      delete db.data.refreshTokens[key];
      db.save();
      return { status: 401, code: 'inactive' };
    }
    rec.usedAt = now();
    const cookies = issue(user, req, rec.family);
    db.save();
    return { cookies, user };
  }

  function revokeFamily(family) {
    for (const [k, t] of Object.entries(db.data.refreshTokens)) if (t.family === family) delete db.data.refreshTokens[k];
  }

  // Đăng xuất thiết bị hiện tại (theo refresh token trong cookie)
  function revokeCurrent(req) {
    const token = parseCookies(req)[REFRESH_COOKIE];
    const rec = token && db.data.refreshTokens[hashKey(token)];
    if (rec) revokeFamily(rec.family);
  }

  // Đăng xuất mọi nơi / khóa tài khoản: xóa refresh token và vô hiệu mọi access token đang lưu hành
  function revokeAll(user) {
    for (const [k, t] of Object.entries(db.data.refreshTokens)) if (t.userId === user.id) delete db.data.refreshTokens[k];
    user.tokenVersion = (user.tokenVersion || 0) + 1;
  }

  // Số thiết bị đang đăng nhập = số chuỗi phiên còn token chưa dùng và chưa hết hạn
  function activeDevices(userId) {
    const fams = new Set();
    Object.values(db.data.refreshTokens).forEach((t) => {
      if (t.userId === userId && !t.usedAt && t.expiresAt > now()) fams.add(t.family);
    });
    return fams.size;
  }

  return { issue, authenticate, refresh, revokeCurrent, revokeAll, activeDevices, clearCookies, hashKey, ACCESS_COOKIE, REFRESH_COOKIE };
}

module.exports = { createTokenService, hashKey };
