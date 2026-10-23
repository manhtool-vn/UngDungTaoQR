/* Đọc file .env đơn giản (KEY=VALUE, bỏ dòng # chú thích), không cần thư viện ngoài.
   Biến đã có sẵn trong môi trường hệ thống luôn được ưu tiên hơn file .env. */
'use strict';
const fs = require('node:fs');

function parseEnv(text) {
  const out = {};
  String(text).replace(/^﻿/, '').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) return;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  });
  return out;
}

function loadEnv(file) {
  let fromFile = {};
  try { fromFile = parseEnv(fs.readFileSync(file, 'utf8')); } catch (e) { /* không có .env cũng được */ }
  return Object.assign({}, fromFile, process.env);
}

module.exports = { parseEnv, loadEnv };
