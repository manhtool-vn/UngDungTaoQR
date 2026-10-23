/* Sao lưu dữ liệu: chép data/db.json thành data/backups/db-YYYYMMDD-HHmm.json, giữ 14 bản mới nhất.
   Chạy tay: npm run backup · chạy hằng ngày: xem deploy/backup.cron.
   Máy chủ ghi db.json qua file tạm rồi đổi tên, nên bản chép lúc nào cũng là một bản trọn vẹn. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('../server/lib/env');
const { ROOT } = require('../server/config');

const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

const env = loadEnv(path.join(ROOT, '.env'));
const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
const src = path.join(dataDir, 'db.json');
const dir = path.join(dataDir, 'backups');

if (!fs.existsSync(src)) {
  console.error('Không thấy ' + src + ' (máy chủ chưa chạy lần nào?)');
  process.exit(1);
}
// Bản chép phải đọc được: file hỏng thì báo lỗi, không ghi đè bản tốt cũ
JSON.parse(fs.readFileSync(src, 'utf8'));

fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const name = 'db-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
fs.copyFileSync(src, path.join(dir, name));
fs.chmodSync(path.join(dir, name), 0o600);

const old = fs.readdirSync(dir).filter((f) => /^db-\d{8}-\d{4}\.json$/.test(f)).sort().reverse().slice(KEEP);
old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
console.log(new Date().toISOString() + ' Đã sao lưu ' + name + (old.length ? ', xóa ' + old.length + ' bản cũ' : ''));
