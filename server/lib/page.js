/* Trang HTML nhỏ do máy chủ tự dựng (mã QR động bị tắt / cần mật khẩu, trang không tồn tại), dùng chung scan.css */
'use strict';
const { securityHeaders } = require('./http');

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function page(res, cfg, status, title, bodyHtml) {
  securityHeaders(res, cfg, { html: true });
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(title) + ' — ManhTool</title>' +
    '<link rel="icon" type="image/png" href="/assets/img/mark-192.png"><link rel="stylesheet" href="/assets/css/scan.css"></head><body>' +
    '<main class="scan-card">' + bodyHtml +
    '<a class="scan-foot" href="' + esc(cfg.publicUrl) + '"><img src="/assets/img/mark-192.png" alt="" width="20" height="20">Tạo mã QR miễn phí tại <b>ManhTool</b></a>' +
    '</main></body></html>');
}

module.exports = { esc, page };
