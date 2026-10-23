/* Phục vụ file trong thư mục public/. Mọi thứ ngoài public/ (server, data, .env…) không bao giờ ra ngoài.
   robots.txt và sitemap.xml dựng theo PUBLIC_URL để không phải sửa tay khi đổi tên miền. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { securityHeaders } = require('../lib/http');
const { page } = require('../lib/page');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const ALIASES = {
  '': 'index.html', admin: 'admin.html', 'favicon.ico': 'assets/img/mark-192.png',
  'dieu-khoan': 'dieu-khoan.html', 'bao-mat': 'bao-mat.html'
};
// Trang công khai cho máy tìm kiếm (cùng đường dẫn mà các trang tự liên kết tới nhau)
const SITEMAP = ['', 'dieu-khoan.html', 'bao-mat.html'];

function notFound(req, res, cfg) {
  // Trình duyệt mở trang → trang 404 dễ đọc; file con (ảnh, script) → chữ ngắn
  if (req.method === 'GET' && /text\/html/.test(String(req.headers.accept || ''))) {
    return page(res, cfg, 404, 'Không tìm thấy trang',
      '<span class="scan-ico scan-ico-warn" aria-hidden="true">?</span><h1>Không tìm thấy trang</h1>' +
      '<p>Đường dẫn này không tồn tại hoặc đã được đổi.</p>' +
      '<p class="scan-links"><a href="/">Về trang tạo mã QR</a><a href="https://manhtool.id.vn">Tất cả công cụ</a></p>');
  }
  securityHeaders(res, cfg);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Không tìm thấy');
}

function text(req, res, cfg, type, body) {
  securityHeaders(res, cfg);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function serveStatic(ctx, req, res, url) {
  const cfg = ctx.config;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    securityHeaders(res, cfg);
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  // Mã động (/q/) không cho máy tìm kiếm lập chỉ mục: đó là đường dẫn chuyển hướng của khách
  if (url.pathname === '/robots.txt') {
    return text(req, res, cfg, 'text/plain; charset=utf-8',
      'User-agent: *\nDisallow: /q/\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ' + cfg.publicUrl + '/sitemap.xml\n');
  }
  if (url.pathname === '/sitemap.xml') {
    return text(req, res, cfg, 'application/xml; charset=utf-8',
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      SITEMAP.map((p) => '  <url><loc>' + cfg.publicUrl + '/' + p + '</loc></url>\n').join('') + '</urlset>\n');
  }

  let rel;
  try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch (e) { return notFound(req, res, cfg); }
  if (Object.prototype.hasOwnProperty.call(ALIASES, rel)) rel = ALIASES[rel];
  // Chặn đi ngược thư mục, file ẩn (.env…), ký tự lạ
  if (rel.includes('\0') || rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return notFound(req, res, cfg);
  const root = cfg.publicDir;
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) return notFound(req, res, cfg);

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(req, res, cfg);
    const ext = path.extname(file).toLowerCase();
    securityHeaders(res, cfg, { html: ext === '.html' || rel === 'sw.js' });
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': rel.startsWith('assets/img/') ? 'public, max-age=86400' : 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { serveStatic };
