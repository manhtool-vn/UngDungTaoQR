/* /api/codes*: quản lý mã QR động của người dùng (tạo, sửa đích, bật/tắt, xóa, thống kê, xuất CSV) */
'use strict';
const { json, readBody, securityHeaders } = require('../lib/http');

async function codeRoutes(ctx, req, res, url) {
  const { config, db, codes } = ctx;
  const p = url.pathname;
  const m = req.method;
  if (p !== '/api/codes' && !p.startsWith('/api/codes/')) return false;

  const user = ctx.requireUser(req, res);
  if (!user) return true;

  if (p === '/api/codes' && m === 'GET') {
    const rk = codes.ranks();
    json(res, config, 200, { codes: codes.listOf(user).map((c) => codes.toPublic(c, false, rk)), quota: codes.quota(user) });
    return true;
  }

  if (p === '/api/codes' && m === 'POST') {
    if (ctx.limited('code:create:' + user.id, 60, 3600000)) { json(res, config, 429, { error: 'Bạn tạo mã quá nhanh, thử lại sau' }); return true; }
    const body = await readBody(req);
    const c = codes.create(user, body);
    json(res, config, 200, { code: codes.toPublic(c, true), quota: codes.quota(user) });
    return true;
  }

  const cm = /^\/api\/codes\/([0-9a-f-]{36})(\/stats|\/export\.csv)?$/.exec(p);
  if (!cm) return false;
  const c = db.data.codes[cm[1]];
  // Không tiết lộ mã của người khác: trả 404 như không tồn tại
  if (!c || c.userId !== user.id) { json(res, config, 404, { error: 'Không tìm thấy mã' }); return true; }

  if (!cm[2] && m === 'GET') {
    json(res, config, 200, { code: codes.toPublic(c, true) });
    return true;
  }

  if (!cm[2] && m === 'PATCH') {
    if (ctx.limited('code:edit:' + user.id, 300, 3600000)) { json(res, config, 429, { error: 'Bạn sửa quá nhanh, thử lại sau' }); return true; }
    if (c.blocked) { json(res, config, 403, { error: 'Mã này đã bị khóa do vi phạm điều khoản, liên hệ ManhTool nếu có nhầm lẫn' }); return true; }
    const body = await readBody(req);
    codes.update(user, c, body);
    json(res, config, 200, { code: codes.toPublic(c, true), quota: codes.quota(user) });
    return true;
  }

  if (!cm[2] && m === 'DELETE') {
    codes.remove(c);
    json(res, config, 200, { ok: true, quota: codes.quota(user) });
    return true;
  }

  if (cm[2] === '/stats' && m === 'GET') {
    json(res, config, 200, { stats: codes.stats(user, c, url.searchParams.get('days')) });
    return true;
  }

  if (cm[2] === '/export.csv' && m === 'GET') {
    if (!ctx.users.isPro(user)) { json(res, config, 403, { error: 'Xuất CSV cần gói Pro' }); return true; }
    securityHeaders(res, config);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="thong-ke-' + c.slug + '.csv"'
    });
    res.end(codes.csv(c));
    return true;
  }

  return false;
}

module.exports = { codeRoutes };
