/* Cấu hình máy chủ, tính từ biến môi trường (.env). Mọi module khác chỉ đọc từ đây. */
'use strict';
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function createConfig(env) {
  env = env || {};
  const port = Number(env.PORT) || 5180;
  const publicUrl = String(env.PUBLIC_URL || env.CLIENT_URL || 'http://localhost:' + port).replace(/\/+$/, '');
  // Địa chỉ gốc in vào mã QR động (nên là tên miền ngắn). Mặc định = PUBLIC_URL
  const shortUrl = String(env.SHORT_URL || publicUrl).replace(/\/+$/, '');
  const isProd = env.NODE_ENV === 'production';
  return {
    env,
    root: ROOT,
    publicDir: path.resolve(ROOT, env.PUBLIC_DIR || 'public'),
    dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
    port,
    host: env.HOST || undefined,
    publicUrl,
    shortUrl,
    origin: new URL(publicUrl).origin,
    https: publicUrl.startsWith('https://'),
    isProd,
    trustProxy: env.TRUST_PROXY === 'true',
    adminEmails: String(env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // JWT: khóa ký lấy từ JWT_SECRET; bản chạy thử tự sinh và lưu trong data/ nếu chưa đặt
    jwtSecret: env.JWT_SECRET ? String(env.JWT_SECRET) : null,
    jwtIssuer: 'manhtool-ma-qr',
    accessTtlSec: Math.max(60, Number(env.ACCESS_TOKEN_MINUTES) * 60 || 15 * 60),
    refreshTtlSec: Math.max(1, Number(env.SESSION_DAYS) || 30) * 86400
  };
}

// Báo lỗi cấu hình nguy hiểm trước khi chạy thật
function checkConfig(cfg) {
  const problems = [];
  if (cfg.isProd) {
    if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) problems.push('JWT_SECRET phải có ít nhất 32 ký tự khi NODE_ENV=production');
    if (!cfg.https) problems.push('PUBLIC_URL phải là https:// khi NODE_ENV=production');
  }
  try { new URL(cfg.shortUrl); } catch (e) { problems.push('SHORT_URL không phải địa chỉ hợp lệ'); }
  return problems;
}

module.exports = { createConfig, checkConfig, ROOT };
