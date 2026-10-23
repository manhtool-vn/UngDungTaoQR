/* /api/reports: báo cáo mã QR động vi phạm (không cần đăng nhập, vẫn phải qua chống CSRF như mọi thao tác ghi) */
'use strict';
const { json, readBody, clientIp } = require('../lib/http');

async function reportRoutes(ctx, req, res, url) {
  const { config, reports } = ctx;
  if (url.pathname !== '/api/reports' || req.method !== 'POST') return false;
  if (ctx.limited('report:' + clientIp(req, config), 10, 3600000)) { json(res, config, 429, { error: 'Bạn gửi quá nhiều báo cáo, thử lại sau' }); return true; }
  const body = await readBody(req);
  const r = reports.create(body, clientIp(req, config));
  json(res, config, 200, { ok: true, already: !!r.already });
  return true;
}

module.exports = { reportRoutes };
