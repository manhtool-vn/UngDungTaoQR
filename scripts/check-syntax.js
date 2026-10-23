/* Kiểm tra cú pháp mọi file JS của trang (public/) và máy chủ (server/): npm run check */
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) files.push(p);
  }
}
['public', 'server', 'scripts'].forEach((d) => walk(path.join(ROOT, d)));

for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log('Cú pháp ổn: ' + files.length + ' file');
