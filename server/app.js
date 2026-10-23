/* ManhTool — Tạo mã QR: ghép các phần của máy chủ thành 1 hàm xử lý request.
   Cấu trúc:
     config.js            cấu hình từ .env
     lib/                 tiện ích thuần: http, jwt, rate limit, đọc .env
     db/store.js          lưu dữ liệu (JSON)
     services/            nghiệp vụ: token (JWT + refresh), Google OAuth, người dùng, mã QR động, thanh toán, báo cáo vi phạm
     routes/              định tuyến: /q/<slug> (quét mã), auth, me, codes, shop, reports, admin, file tĩnh */
'use strict';
const { createConfig } = require('./config');
const { json, redirect, clientIp, HttpError } = require('./lib/http');
const { createRateLimiter } = require('./lib/rateLimit');
const { createTokenService } = require('./services/tokens');
const { createGoogleService } = require('./services/google');
const { createUserService } = require('./services/users');
const { createPaymentService } = require('./services/payments');
const { createCodeService } = require('./services/codes');
const { createReportService } = require('./services/reports');
const { authRoutes } = require('./routes/auth');
const { meRoutes } = require('./routes/me');
const { codeRoutes } = require('./routes/codes');
const { shopRoutes } = require('./routes/shop');
const { adminRoutes } = require('./routes/admin');
const { reportRoutes } = require('./routes/reports');
const { redirectRoutes } = require('./routes/redirect');
const { serveStatic } = require('./routes/static');

const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'maqr';
const ROUTES = [authRoutes, meRoutes, codeRoutes, shopRoutes, reportRoutes, adminRoutes];
// Máy chủ ngân hàng gọi vào (không phải trình duyệt) → không áp chống CSRF, xác thực bằng khóa riêng
const SERVER_TO_SERVER = new Set(['/api/payments/webhook']);

function createApp(opts) {
  const config = opts.config || createConfig(opts.env);
  const db = opts.db;
  const now = opts.now || Date.now;
  const log = opts.log || ((...a) => console.log(...a));
  const fetch = opts.fetch || globalThis.fetch;

  const ctx = { config, db, now, log, limited: createRateLimiter(now) };
  ctx.tokens = createTokenService(ctx);
  ctx.google = createGoogleService({ config, db, fetch, log });
  ctx.users = createUserService(ctx);
  ctx.payments = createPaymentService(ctx);
  ctx.codes = createCodeService(ctx);
  ctx.reports = createReportService(ctx);

  // Lấy người dùng đang đăng nhập; nếu không có thì trả lỗi 401 (code token_expired để trang tự làm mới token)
  ctx.requireUser = function (req, res) {
    const a = ctx.tokens.authenticate(req);
    if (a.user) return a.user;
    json(res, config, 401, a.error === 'none'
      ? { error: 'Chưa đăng nhập', code: 'unauthorized' }
      : { error: 'Phiên đăng nhập hết hạn', code: 'token_expired' });
    return null;
  };

  // Chống giả mạo yêu cầu (CSRF) cho mọi thao tác ghi:
  //  - phải có header X-Requested-With (trang khác không gửi được nếu không qua CORS, mà máy chủ không bật CORS)
  //  - nếu trình duyệt gửi Origin / Sec-Fetch-Site thì phải là cùng trang
  function csrfOk(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) return false;
    const origin = req.headers.origin;
    if (origin && origin !== config.origin) return false;
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return false;
    return true;
  }

  // Tên miền ngắn (SHORT_URL) chỉ để in vào mã động: trang chủ, đăng nhập, API… chuyển về tên miền chính,
  // tránh cookie đăng nhập nằm nhầm tên miền và thao tác ghi bị chặn vì khác Origin
  const shortHost = new URL(config.shortUrl).host.toLowerCase();
  const onShortHost = (req) => shortHost !== new URL(config.publicUrl).host.toLowerCase() &&
    String(req.headers.host || '').toLowerCase() === shortHost;

  return async function handler(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
    try {
      if (onShortHost(req) && !/^\/(q|assets)\/|^\/(robots\.txt|favicon\.ico)$/.test(url.pathname)) {
        return redirect(res, config, config.publicUrl + url.pathname + url.search, null, 301);
      }
      if (url.pathname.startsWith('/q/')) return await redirectRoutes(ctx, req, res, url);
      if (!url.pathname.startsWith('/api/')) return serveStatic(ctx, req, res, url);
      if (!SERVER_TO_SERVER.has(url.pathname) && !csrfOk(req)) return json(res, config, 403, { error: 'Yêu cầu không hợp lệ', code: 'csrf' });
      for (const route of ROUTES) if (await route(ctx, req, res, url)) return;
      return json(res, config, 404, { error: 'Không tìm thấy' });
    } catch (e) {
      if (e instanceof HttpError) return json(res, config, e.status, { error: e.message });
      log('[server] Lỗi khi xử lý', req.method, url.pathname, 'từ', clientIp(req, config), e);
      if (!res.headersSent) return json(res, config, 500, { error: 'Lỗi máy chủ' });
      res.end();
    }
  };
}

module.exports = { createApp };
