/* /api/shop, /api/orders*: mua gói Pro · /api/payments/webhook: ngân hàng (SePay) báo tiền vào */
'use strict';
const crypto = require('node:crypto');
const { json, readBody, clientIp } = require('../lib/http');

// So khóa webhook theo thời gian không đổi. Chấp nhận "Apikey KEY" (kiểu SePay), "Bearer KEY" hoặc header x-api-key.
function webhookKeyOk(req, key) {
  if (!key) return false;
  const h = String(req.headers.authorization || '').trim();
  const x = String(req.headers['x-api-key'] || '').trim();
  let token = x;
  if (!token) {
    const m = /^(?:Apikey|Bearer)\s+(.+)$/i.exec(h);
    token = m ? m[1].trim() : (h === key ? h : '');
  }
  if (!token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

async function shopRoutes(ctx, req, res, url) {
  const { config, db, payments, now } = ctx;
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/shop' && m === 'GET') {
    json(res, config, 200, payments.publicInfo());
    return true;
  }

  if (p === '/api/payments/webhook' && m === 'POST') {
    const key = config.env.PAYMENT_WEBHOOK_KEY ? String(config.env.PAYMENT_WEBHOOK_KEY) : '';
    if (key.length < 16) { json(res, config, 503, { success: false, error: 'Chưa cấu hình PAYMENT_WEBHOOK_KEY' }); return true; }
    if (ctx.limited('webhook:' + clientIp(req, config), 300, 60000)) { json(res, config, 429, { success: false }); return true; }
    if (!webhookKeyOk(req, key)) { json(res, config, 401, { success: false, error: 'Sai khóa webhook' }); return true; }
    const body = await readBody(req);
    const r = payments.handleWebhook(body);
    if (!r.ok) { json(res, config, r.status, { success: false, error: r.error }); return true; }
    // SePay coi phản hồi 200 + success:true là đã nhận, không gửi lại
    json(res, config, 200, { success: true, result: r.result });
    return true;
  }

  if (p !== '/api/orders' && !p.startsWith('/api/orders/')) return false;
  const user = ctx.requireUser(req, res);
  if (!user) return true;

  if (p === '/api/orders' && m === 'GET') {
    const list = Object.values(db.data.orders).filter((o) => o.userId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map((o) => payments.toPublic(o, false));
    json(res, config, 200, { orders: list });
    return true;
  }

  if (p === '/api/orders' && m === 'POST') {
    if (ctx.limited('order:' + user.id, 20, 3600000)) { json(res, config, 429, { error: 'Bạn tạo đơn quá nhiều, thử lại sau' }); return true; }
    const body = await readBody(req);
    const r = payments.create(user, String(body.product || ''));
    if (r.error) { json(res, config, r.status, { error: r.error }); return true; }
    json(res, config, 200, { order: payments.toPublic(r.order, true) });
    return true;
  }

  const om = /^\/api\/orders\/([0-9a-f-]{36})(\/cancel)?$/.exec(p);
  if (om) {
    const order = db.data.orders[om[1]];
    // Không tiết lộ đơn của người khác: trả 404 như không tồn tại
    if (!order || order.userId !== user.id) { json(res, config, 404, { error: 'Không tìm thấy đơn' }); return true; }
    if (!om[2] && m === 'GET') {
      json(res, config, 200, { order: payments.toPublic(order, true), user: ctx.users.toPublic(user), serverTime: now() });
      return true;
    }
    if (om[2] && m === 'POST') {
      json(res, config, payments.cancel(order) ? 200 : 400, { order: payments.toPublic(order, false) });
      return true;
    }
  }
  return false;
}

module.exports = { shopRoutes, webhookKeyOk };
