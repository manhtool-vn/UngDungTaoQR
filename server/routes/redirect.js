/* /q/<slug>: người dùng quét mã QR động → ghi lượt quét → chuyển sang đích đến.
   Mã tắt / hết hạn / đủ lượt / vượt hạn mức / có mật khẩu → hiện trang nhỏ giải thích (không chuyển đi). */
'use strict';
const { securityHeaders, cookie, parseCookies, clientIp, HttpError } = require('../lib/http');
const { esc, page } = require('../lib/page');

const MAX_FORM = 4096;

const MESSAGES = {
  missing: ['Không tìm thấy mã QR', 'Mã này không tồn tại hoặc đã bị chủ sở hữu xóa.'],
  off: ['Mã QR đang tạm dừng', 'Chủ sở hữu đã tạm tắt mã này. Bạn thử lại sau nhé.'],
  quota: ['Mã QR đang tạm dừng', 'Mã này tạm ngừng hoạt động do gói dịch vụ của chủ sở hữu đã hết hạn.'],
  expired: ['Mã QR đã hết hạn', 'Mã này chỉ dùng được đến một thời điểm nhất định và nay đã hết hạn.'],
  limit: ['Mã QR đã đủ lượt quét', 'Mã này đã đạt số lượt quét tối đa chủ sở hữu đặt ra.'],
  blocked: ['Mã QR đã bị khóa', 'Mã này bị khóa vì vi phạm điều khoản sử dụng của ManhTool.']
};

function statusPage(res, cfg, status, kind) {
  const [title, text] = MESSAGES[kind] || MESSAGES.missing;
  // Mã bị khóa: dẫn tới điều khoản để người quét biết vì sao
  const more = kind === 'blocked' ? '<p class="scan-more"><a href="' + esc(cfg.publicUrl) + '/dieu-khoan">Điều khoản sử dụng</a></p>' : '';
  page(res, cfg, status, title, '<span class="scan-ico scan-ico-warn" aria-hidden="true">!</span><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p>' + more);
}

function passwordPage(res, cfg, c, error) {
  page(res, cfg, error ? 401 : 200, 'Nhập mật khẩu',
    '<span class="scan-ico" aria-hidden="true">#</span><h1>Mã QR có mật khẩu</h1><p>Nhập mật khẩu chủ sở hữu cung cấp để mở nội dung.</p>' +
    '<form method="post" action="/q/' + esc(c.slug) + '">' +
    '<input type="password" name="password" autocomplete="off" required maxlength="64" aria-label="Mật khẩu" placeholder="Mật khẩu" autofocus>' +
    (error ? '<p class="scan-err">' + esc(error) + '</p>' : '') +
    '<button type="submit">Mở</button></form>');
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (ch) => {
      size += ch.length;
      if (size > MAX_FORM) { reject(new HttpError(413, 'Dữ liệu quá lớn')); req.destroy(); return; }
      chunks.push(ch);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

function go(res, cfg, location) {
  securityHeaders(res, cfg);
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  res.end();
}

async function redirectRoutes(ctx, req, res, url) {
  const { config, codes } = ctx;
  const m = /^\/q\/([A-Za-z0-9-]{3,32})\/?$/.exec(url.pathname);
  if (!m) { statusPage(res, config, 404, 'missing'); return true; }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
    securityHeaders(res, config);
    res.writeHead(405, { Allow: 'GET, HEAD, POST' });
    res.end();
    return true;
  }
  const ip = clientIp(req, config);
  if (ctx.limited('scan:' + ip, 600, 60000)) { statusPage(res, config, 429, 'off'); return true; }

  const c = codes.bySlug(m[1]);
  if (!c) { statusPage(res, config, 404, 'missing'); return true; }
  const st = codes.state(c);
  if (st !== 'active') { statusPage(res, config, st === 'expired' || st === 'blocked' ? 410 : 200, st); return true; }

  // Mã có mật khẩu: đúng mật khẩu → cookie mở khóa riêng cho đường dẫn của mã này (12 giờ)
  const cookieName = 'qp_' + c.slug.replace(/-/g, '_');
  if (c.pw) {
    if (req.method === 'POST') {
      if (ctx.limited('scan:pw:' + ip + ':' + c.id, 10, 15 * 60000)) { passwordPage(res, config, c, 'Nhập sai quá nhiều lần, thử lại sau 15 phút'); return true; }
      const form = await readForm(req);
      if (!codes.checkPassword(form.get('password') || '', c.pw)) { passwordPage(res, config, c, 'Mật khẩu chưa đúng'); return true; }
      securityHeaders(res, config);
      res.writeHead(303, {
        Location: '/q/' + c.slug, 'Cache-Control': 'no-store',
        'Set-Cookie': cookie(cookieName, codes.unlockToken(c), { path: '/q/' + c.slug, sameSite: 'Lax', secure: config.https, maxAge: 12 * 3600 })
      });
      res.end();
      return true;
    }
    if (parseCookies(req)[cookieName] !== codes.unlockToken(c)) { passwordPage(res, config, c); return true; }
  } else if (req.method === 'POST') {
    go(res, config, '/q/' + c.slug);
    return true;
  }

  // HEAD (máy kiểm tra liên kết) không tính là lượt quét
  if (req.method === 'GET') {
    const cc = config.trustProxy ? String(req.headers['cf-ipcountry'] || '').toUpperCase() : '';
    codes.record(c, req, ip, /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : '');
  }
  go(res, config, codes.destination(c, req.headers['user-agent']));
  return true;
}

module.exports = { redirectRoutes };
