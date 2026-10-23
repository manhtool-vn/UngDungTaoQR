/* /api/config, /api/auth/*: đăng nhập Google, làm mới token, đăng xuất */
'use strict';
const crypto = require('node:crypto');
const { json, redirect, appendCookies, clientIp } = require('../lib/http');

// Chỉ cho quay về đường dẫn nội bộ (chặn chuyển hướng sang trang lạ)
function safeReturn(p) {
  p = String(p || '/');
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(p) && !p.startsWith('/api/') ? p : '/';
}

async function authRoutes(ctx, req, res, url) {
  const { config, db, tokens, google, users, now } = ctx;
  const p = url.pathname;
  const m = req.method;
  const fail = (msg) => redirect(res, config, '/?login_error=' + encodeURIComponent(msg), tokens.clearCookies());
  const tooMany = () => ctx.limited('auth:' + clientIp(req, config), 60, 15 * 60000);

  if (p === '/api/config' && m === 'GET') {
    json(res, config, 200, {
      googleLogin: google.settings().ready, shop: ctx.payments.publicInfo(), shortBase: config.shortUrl + '/q/',
      freeLimit: users.limitFor(false), proLimit: users.limitFor(true)
    });
    return true;
  }

  if (p === '/api/auth/google/start' && m === 'GET') {
    if (tooMany()) { fail('Thử lại quá nhiều lần, vui lòng đợi vài phút'); return true; }
    if (!google.settings().ready) { fail('Đăng nhập bằng Google chưa được bật'); return true; }
    db.prune(now());
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    db.data.oauthStates[tokens.hashKey(state)] = { verifier, returnTo: safeReturn(url.searchParams.get('return')), expiresAt: now() + 10 * 60000 };
    db.save();
    redirect(res, config, google.authUrl(state, verifier));
    return true;
  }

  if (p === '/api/auth/google/callback' && m === 'GET') {
    if (tooMany()) { fail('Thử lại quá nhiều lần, vui lòng đợi vài phút'); return true; }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (error) { fail(error === 'access_denied' ? 'Bạn đã hủy đăng nhập bằng Google' : 'Google từ chối yêu cầu đăng nhập'); return true; }
    if (!code || !state) { fail('Thiếu thông tin xác thực từ Google'); return true; }

    // state chỉ dùng 1 lần: xóa ngay khi đọc để chống lặp lại / giả mạo
    const key = tokens.hashKey(state);
    const st = db.data.oauthStates[key];
    delete db.data.oauthStates[key];
    db.save();
    if (!st || st.expiresAt <= now()) { fail('Phiên đăng nhập đã hết hạn, vui lòng thử lại'); return true; }
    if (!google.settings().ready) { fail('Đăng nhập bằng Google chưa được bật'); return true; }

    let profile;
    try { profile = await google.exchange(code, st.verifier); } catch (e) { fail(e.message); return true; }
    const r = users.fromGoogle(profile);
    if (r.error) { db.save(); fail(r.error); return true; }
    const cookies = tokens.issue(r.user, req);
    db.save();
    const back = st.returnTo || '/';
    redirect(res, config, back + (back.includes('?') ? '&' : '?') + 'login=ok', cookies);
    return true;
  }

  // Làm mới access token bằng refresh token (xoay vòng)
  if (p === '/api/auth/refresh' && m === 'POST') {
    if (ctx.limited('refresh:' + clientIp(req, config), 120, 15 * 60000)) { json(res, config, 429, { error: 'Thử lại sau' }); return true; }
    const r = tokens.refresh(req);
    if (!r.cookies) {
      if (r.status === 401) appendCookies(res, tokens.clearCookies());
      json(res, config, r.status, { error: r.status === 409 ? 'Thử lại' : 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại', code: r.code });
      return true;
    }
    appendCookies(res, r.cookies);
    json(res, config, 200, { ok: true });
    return true;
  }

  if (p === '/api/auth/logout' && m === 'POST') {
    tokens.revokeCurrent(req);
    db.save();
    appendCookies(res, tokens.clearCookies());
    json(res, config, 200, { ok: true });
    return true;
  }

  if (p === '/api/auth/logout-all' && m === 'POST') {
    const user = ctx.requireUser(req, res);
    if (!user) return true;
    tokens.revokeAll(user);
    users.audit(user, 'Đăng xuất mọi thiết bị', user.email);
    db.save();
    appendCookies(res, tokens.clearCookies());
    json(res, config, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { authRoutes, safeReturn };
