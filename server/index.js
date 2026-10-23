/* Khởi động máy chủ: npm start (= node server/index.js) */
'use strict';
const http = require('node:http');
const path = require('node:path');
const { loadEnv } = require('./lib/env');
const { createConfig, checkConfig, ROOT } = require('./config');
const { createStore } = require('./db/store');
const { createApp } = require('./app');

const env = loadEnv(path.join(ROOT, '.env'));
const config = createConfig(env);

const problems = checkConfig(config);
if (problems.length) {
  problems.forEach((p) => console.error('Lỗi cấu hình: ' + p));
  process.exit(1);
}
if (!config.jwtSecret) console.warn('Chưa đặt JWT_SECRET: đang dùng khóa tự sinh trong data/ (chỉ nên dùng khi chạy thử).');

const db = createStore(config.dataDir);
const server = http.createServer(createApp({ config, db }));
server.headersTimeout = 20000;
server.requestTimeout = 30000;

server.listen(config.port, config.host, () => {
  console.log('Tạo mã QR đang chạy: ' + config.publicUrl);
  console.log('Mã QR động trỏ về: ' + config.shortUrl + '/q/…');
  console.log('Trang quản trị: ' + config.publicUrl + '/admin');
  if (!env.GOOGLE_CLIENT_ID && !db.data.settings.googleClientId) {
    console.log('Chưa có Google Client ID: đăng nhập Google đang tắt (đặt trong .env hoặc trang quản trị).');
  }
});

// Dọn token hết hạn mỗi giờ
setInterval(() => db.prune(Date.now()), 3600000).unref();

// Tắt êm khi bị dừng (Ctrl+C, systemd, Docker…): ghi nốt lượt quét đang chờ
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => {
  db.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}));
