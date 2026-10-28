/* /api/me*: hồ sơ, đổi tên, xóa tài khoản, xuất dữ liệu */
'use strict';
const { json, readBody, appendCookies, securityHeaders } = require('../lib/http');

async function meRoutes(ctx, req, res, url) {
  const { config, db, tokens, users, codes, now } = ctx;
  const p = url.pathname;
  const m = req.method;
  if (p !== '/api/me' && !p.startsWith('/api/me/')) return false;

  // Chưa đăng nhập: /api/me trả về user null (không báo lỗi làm bẩn console của khách)
  if (p === '/api/me' && m === 'GET') {
    const a = tokens.authenticate(req);
    if (a.error === 'none') { json(res, config, 200, { user: null }); return true; }
    if (a.error) { json(res, config, 401, { error: 'Phiên đăng nhập hết hạn', code: 'token_expired' }); return true; }
    ctx.promo.claim(a.user); // đang mở miễn phí có "giữ vĩnh viễn" → ghi nhận cho tài khoản này
    json(res, config, 200, { user: users.toPublic(a.user), quota: codes.quota(a.user), sessions: tokens.activeDevices(a.user.id) });
    return true;
  }

  const user = ctx.requireUser(req, res);
  if (!user) return true;

  if (p === '/api/me' && m === 'PATCH') {
    const body = await readBody(req);
    if (typeof body.name === 'string') {
      const name = body.name.replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!name) { json(res, config, 400, { error: 'Tên không được để trống' }); return true; }
      user.name = name;
    }
    db.save();
    json(res, config, 200, { user: users.toPublic(user) });
    return true;
  }

  if (p === '/api/me' && m === 'DELETE') {
    if (user.role === 'admin' && users.admins().length <= 1) {
      json(res, config, 400, { error: 'Bạn là quản trị viên duy nhất. Hãy cấp quyền quản trị cho người khác trước khi xóa tài khoản.' });
      return true;
    }
    tokens.revokeAll(user);
    codes.removeAllOf(user.id);
    delete db.data.users[user.id];
    users.audit(user, 'Tự xóa tài khoản', user.email);
    db.save();
    appendCookies(res, tokens.clearCookies());
    json(res, config, 200, { ok: true });
    return true;
  }

  if (p === '/api/me/export' && m === 'GET') {
    const list = codes.listOf(user).map((c) => Object.assign(codes.toPublic(c, true), { stats: c.stats }));
    const body = JSON.stringify({ exportedAt: new Date(now()).toISOString(), account: users.toPublic(user), codes: list }, null, 2);
    securityHeaders(res, config);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="ma-qr-du-lieu.json"'
    });
    res.end(body);
    return true;
  }

  return false;
}

module.exports = { meRoutes };
