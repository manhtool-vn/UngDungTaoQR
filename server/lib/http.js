/* Tiện ích HTTP dùng chung: header bảo mật, trả JSON, chuyển hướng, cookie, đọc thân request. */
'use strict';

const MAX_BODY = 512 * 1024;

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// Chính sách nội dung (CSP): chỉ chạy script của chính trang, chặn nhúng trang vào web khác
function csp() {
  return [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://img.vietqr.io https://*.google-analytics.com https://*.googletagmanager.com",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    "manifest-src 'self'",
    "worker-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

function securityHeaders(res, cfg, opts) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (cfg && cfg.https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (opts && opts.html) res.setHeader('Content-Security-Policy', csp());
}

function json(res, cfg, status, body) {
  securityHeaders(res, cfg);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res, cfg, location, cookies, status) {
  securityHeaders(res, cfg);
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (cookies && cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(status || 302, headers);
  res.end();
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i <= 0) return;
    try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* cookie hỏng: bỏ qua */ }
  });
  return out;
}

// Tạo chuỗi Set-Cookie; HttpOnly luôn bật để JavaScript trên trang không đọc được token
function cookie(name, value, o) {
  let s = name + '=' + encodeURIComponent(value || '') + '; Path=' + (o.path || '/') + '; HttpOnly; SameSite=' + (o.sameSite || 'Lax');
  if (o.secure) s += '; Secure';
  s += '; Max-Age=' + Math.max(0, Math.floor(o.maxAge || 0));
  return s;
}

function appendCookies(res, list) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [].concat(prev || [], list));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Dữ liệu quá lớn')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      if (!type.startsWith('application/json')) return reject(new HttpError(415, 'Chỉ nhận dữ liệu JSON'));
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new HttpError(400, 'Dữ liệu không hợp lệ'));
        resolve(v);
      } catch (e) { reject(new HttpError(400, 'Dữ liệu không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req, cfg) {
  if (cfg.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

module.exports = { HttpError, securityHeaders, json, redirect, parseCookies, cookie, appendCookies, readBody, clientIp, csp };
