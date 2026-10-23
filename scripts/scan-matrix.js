/* Ma trận "Thử quét": vẽ PNG từng thiết kế ở 360 / 640 / 1000 px (thêm 2 bản hơi nhòe như ảnh camera) với 3 độ dài nội dung,
   rồi giải mã lại bằng jsQR trong trình duyệt thật (Edge / Chrome chạy ngầm). Chạy mỗi khi thêm kiểu chấm, mắt, hình, khung.
     npm run scan-matrix            mọi mẫu sẵn + từng kiểu chấm / mắt / hình / khung
     npm run scan-matrix -- heart   chỉ những dòng có tên chứa "heart"
   Mẫu sẵn phải đọc được ở mọi lần thử (không thì thoát mã lỗi 1); các dòng kiểu lẻ chỉ để tham khảo.
   Cần Node 22+ (WebSocket có sẵn) và Edge / Chrome; đường dẫn khác thì đặt biến môi trường CHROME_PATH. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createApp } = require('../server/app');
const { createConfig } = require('../server/config');
const { createStore } = require('../server/db/store');

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
].filter(Boolean);
const filter = (process.argv[2] || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chạy trong trang: dựng danh sách thiết kế từ chính QRRender + mẫu sẵn của trang, rồi vẽ và giải mã từng ảnh
const PAGE = `(async (filter) => {
  await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'assets/vendor/jsQR.js'; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  const R = window.QRRender, Q = window.QRCore;
  const list = window.QRApp.presets.map((p) => ({ name: 'Mẫu ' + p.name, preset: true, d: Object.assign({}, R.DEFAULT, p.d) }));
  R.SHAPES.forEach((shape) => list.push({ name: 'Hình ' + shape, d: { shape } }));
  R.DOTS.forEach((dot) => list.push({ name: 'Chấm ' + dot, d: { dot } }));
  R.FRAMES.forEach((eyeFrame) => list.push({ name: 'Khung mắt ' + eyeFrame, d: { eyeFrame } }));
  R.BALLS.forEach((eyeBall) => list.push({ name: 'Lõi mắt ' + eyeBall, d: { eyeBall, eyeFrame: 'rounded' } }));
  R.LABELS.forEach((label) => list.push({ name: 'Khung ' + label, d: { label } }));
  const texts = {
    ngắn: 'https://manhtool.id.vn/menu',
    vừa: 'https://shop.example.vn/san-pham/ao-thun-cotton-trang?ref=qr&utm_source=in-an',
    dài: 'https://example.vn/' + 'thiep-moi-dam-cuoi-anh-tuan-va-chi-lan-ngay-20-thang-12-nam-2026/'.repeat(3) + '?ma=MTQR8K2P9Q'
  };
  async function decode(text, d, size, blur) {
    const qr = Q.encode(text, { ecc: d.logo && d.ecc !== 'H' ? 'H' : d.ecc || 'M' });
    const out = R.svg(qr, d, { size });
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out.svg); });
    const pad = Math.round(size * 0.12), c = document.createElement('canvas');
    c.width = out.width + pad * 2; c.height = out.height + pad * 2;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    if (blur) ctx.filter = 'blur(' + blur + 'px)';
    ctx.drawImage(img, pad, pad, out.width, out.height);
    const res = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    return !!(res && res.data === text);
  }
  const rows = [];
  for (const item of list) {
    if (filter && item.name.toLowerCase().indexOf(filter) < 0) continue;
    const row = { name: item.name, preset: !!item.preset, ok: 0, total: 0, fails: [] };
    for (const [tk, text] of Object.entries(texts)) {
      for (const [size, blur] of [[360, 0], [640, 0], [1000, 0], [360, 0.8], [640, 1.2]]) {
        row.total++;
        let ok = false;
        try { ok = await decode(text, item.d, size, blur); } catch (e) { ok = false; }
        if (ok) row.ok++; else row.fails.push(tk + ' ' + size + (blur ? ' nhòe' : ''));
      }
    }
    rows.push(row);
  }
  return rows;
})`;

(async () => {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) { console.error('Không tìm thấy Edge / Chrome. Đặt CHROME_PATH=<đường dẫn trình duyệt> rồi chạy lại.'); process.exit(2); }
  if (typeof WebSocket === 'undefined') { console.error('Cần Node 22+ (có sẵn WebSocket).'); process.exit(2); }

  // Máy chủ tạm với dữ liệu riêng, chỉ để phục vụ trang tĩnh
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maqr-scan-'));
  const db = createStore(tmp);
  const server = http.createServer(createApp({ config: createConfig({ DATA_DIR: tmp }), db, log: () => {} }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + server.address().port + '/';

  const port = 9300 + Math.floor(Math.random() * 600);
  const browser = spawn(exe, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(tmp, 'browser'), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const done = (code) => { browser.kill(); server.close(); setTimeout(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* trình duyệt chưa nhả file */ } process.exit(code); }, 500); };

  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      try { target = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find((t) => t.type === 'page'); } catch (e) { await sleep(250); }
    }
    if (!target) throw new Error('Trình duyệt không mở được cổng điều khiển');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0;
    const wait = {};
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } });
    const send = (method, params) => new Promise((r) => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    await send('Page.enable');
    await send('Page.navigate', { url });
    for (let i = 0; i < 40; i++) {
      const r = await send('Runtime.evaluate', { expression: '!!(window.QRApp && window.QRApp.presets)', returnByValue: true });
      if (r.result.result.value) break;
      await sleep(250);
    }
    const r = await send('Runtime.evaluate', { expression: PAGE + '(' + JSON.stringify(filter) + ')', awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    const rows = r.result.result.value;
    let bad = 0;
    rows.forEach((x) => {
      const pass = x.ok === x.total;
      if (!pass && x.preset) bad++;
      console.log((pass ? 'đạt ' : x.preset ? 'LỖI ' : 'yếu ') + String(x.ok).padStart(2) + '/' + x.total + '  ' + x.name.padEnd(26) + (x.fails.length ? '  trượt: ' + x.fails.join(', ') : ''));
    });
    console.log(bad ? bad + ' mẫu sẵn chưa đọc được ở mọi lần thử' : 'Mọi mẫu sẵn đều đọc được.');
    ws.close();
    done(bad ? 1 : 0);
  } catch (e) {
    console.error(e.message || e);
    done(2);
  }
})();
