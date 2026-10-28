'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');
const { createConfig } = require('../server/config');
const { createStore } = require('../server/db/store');
const { createTokenService } = require('../server/services/tokens');
const { parseUA } = require('../server/services/codes');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const ZALO = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0 Mobile Safari/537.36 Zalo android/12345';
const DAY = 86400000;

// Máy chủ thật trên cổng ngẫu nhiên, đồng hồ giả để thử hết hạn
async function setup(t, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maqr-'));
  const config = createConfig(Object.assign({ PUBLIC_URL: 'http://localhost:5180', DATA_DIR: dir, PAYMENT_WEBHOOK_KEY: 'k'.repeat(24) }, env));
  const clock = { t: Date.parse('2026-10-21T03:00:00Z') };
  const now = () => clock.t;
  const db = createStore(dir);
  const server = http.createServer(createApp({ config, db, now, log: () => {} }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + server.address().port;
  const tokens = createTokenService({ config, db, now });
  t.after(() => { server.close(); db.flush(); fs.rmSync(dir, { recursive: true, force: true }); });

  function user(email, extra) {
    const u = Object.assign({ id: require('node:crypto').randomUUID(), email, name: email.split('@')[0], role: 'user', proUntil: null, active: true, tokenVersion: 0, createdAt: new Date(now()).toISOString() }, extra);
    db.data.users[u.id] = u;
    return { u, cookie: cookieFor(u) };
  }
  // Đăng nhập lại (access token chỉ sống 15 phút, đồng hồ giả nhảy nhiều ngày)
  function cookieFor(u) { return tokens.issue(u, null).map((c) => c.split(';')[0]).join('; '); }

  async function req(method, p, o) {
    o = o || {};
    const headers = Object.assign({}, o.headers);
    if (o.cookie) headers.cookie = o.cookie;
    if (method !== 'GET' && method !== 'HEAD' && p.startsWith('/api/') && !o.noCsrf) headers['x-requested-with'] = 'maqr';
    let body;
    if (o.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.json); }
    if (o.form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(o.form).toString(); }
    const r = await fetch(base + p, { method, headers, body, redirect: 'manual' });
    const text = Buffer.from(await r.arrayBuffer()).toString('utf8'); // giữ BOM để kiểm tra file CSV
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* trang HTML */ }
    return { status: r.status, data, text, headers: r.headers };
  }

  // fetch không cho đổi header Host → dùng http.get để giả lập truy cập bằng tên miền khác
  function getAs(host, p, headers) {
    return new Promise((ok, fail) => {
      http.get(base + p, { headers: Object.assign({ host }, headers) }, (r) => {
        let text = '';
        r.setEncoding('utf8');
        r.on('data', (d) => { text += d; });
        r.on('end', () => ok({ status: r.statusCode, headers: r.headers, text }));
      }).on('error', fail);
    });
  }

  return { db, config, clock, user, req, cookieFor, getAs };
}

test('Nhận dạng thiết bị và trình duyệt từ User-Agent', () => {
  assert.deepEqual(parseUA(IPHONE), { os: 'iOS', br: 'Safari', dev: 'mobile' });
  assert.deepEqual(parseUA(ANDROID), { os: 'Android', br: 'Chrome', dev: 'mobile' });
  assert.equal(parseUA(ZALO).br, 'Zalo');
});

test('Mã động: cần đăng nhập + chống CSRF, tạo xong quét được, đếm lượt, chuyển theo thiết bị', async (t) => {
  const s = await setup(t);
  const a = s.user('a@x.vn');
  assert.equal((await s.req('POST', '/api/codes', { json: { target: 'a.vn' } })).status, 401);
  assert.equal((await s.req('POST', '/api/codes', { cookie: a.cookie, noCsrf: true, json: { target: 'a.vn' } })).status, 403);

  const r = await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'manhtool.id.vn/menu', iosUrl: 'https://apps.apple.com/app/x' } });
  assert.equal(r.status, 200);
  const c = r.data.code;
  assert.equal(c.target, 'https://manhtool.id.vn/menu');
  assert.match(c.shortUrl, /^http:\/\/localhost:5180\/q\/[a-z2-9]{6}$/);
  assert.equal(c.state, 'active');

  let q = await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } });
  assert.equal(q.status, 302);
  assert.equal(q.headers.get('location'), 'https://manhtool.id.vn/menu');
  q = await s.req('GET', '/q/' + c.slug.toUpperCase(), { headers: { 'user-agent': IPHONE } });
  assert.equal(q.headers.get('location'), 'https://apps.apple.com/app/x', 'iPhone sang App Store, không phân biệt hoa thường');
  await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': IPHONE } }); // cùng máy quét lại: không tính người mới
  await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': 'facebookexternalhit/1.1' } }); // máy xem trước liên kết: không tính
  await s.req('HEAD', '/q/' + c.slug, { headers: { 'user-agent': IPHONE } });

  const st = await s.req('GET', '/api/codes/' + c.id + '/stats?days=7', { cookie: a.cookie });
  assert.equal(st.data.stats.total, 3);
  assert.equal(st.data.stats.unique, 2);
  assert.equal(st.data.stats.series.length, 7);
  assert.equal(st.data.stats.series[6].n, 3);
  assert.deepEqual(st.data.stats.os.map((x) => x.k).sort(), ['Android', 'iOS']);
  assert.equal(st.data.stats.hours[10], 3, '03:00 UTC = 10 giờ sáng giờ Việt Nam');

  // Người khác không thấy mã này
  const b = s.user('b@x.vn');
  assert.equal((await s.req('GET', '/api/codes/' + c.id, { cookie: b.cookie })).status, 404);
  assert.equal((await s.req('PATCH', '/api/codes/' + c.id, { cookie: b.cookie, json: { target: 'evil.vn' } })).status, 404);

  // Đổi đích → lịch sử giữ đích cũ, mã in sẵn dẫn tới đích mới
  const e = await s.req('PATCH', '/api/codes/' + c.id, { cookie: a.cookie, json: { target: 'https://manhtool.id.vn/menu-moi' } });
  assert.equal(e.data.code.history[0].target, 'https://manhtool.id.vn/menu');
  assert.equal((await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } })).headers.get('location'), 'https://manhtool.id.vn/menu-moi');

  // Tắt mã → trang tạm dừng, không chuyển đi
  await s.req('PATCH', '/api/codes/' + c.id, { cookie: a.cookie, json: { active: false } });
  q = await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } });
  assert.equal(q.status, 200);
  assert.match(q.text, /tạm dừng/);
  assert.equal((await s.req('GET', '/q/khongco', {})).status, 404);
});

test('Kiểm tra đích đến: chặn javascript:, chặn vòng lặp mã động, cần tên miền', async (t) => {
  const s = await setup(t);
  const a = s.user('a@x.vn');
  for (const target of ['javascript:alert(1)', 'http://localhost:5180/q/abcdef', 'xin chao', '', 'ftp://a.vn/x']) {
    const r = await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target } });
    assert.equal(r.status, 400, target);
  }
});

test('Hạn mức gói miễn phí, tính năng Pro, hết Pro thì mã vượt mức tạm dừng sau 3 ngày', async (t) => {
  const s = await setup(t);
  const a = s.user('a@x.vn');
  const ids = [];
  for (let i = 0; i < 3; i++) {
    s.clock.t += 1000;
    ids.push((await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn/' + i } })).data.code.id);
  }
  let r = await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn/4' } });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /miễn phí/);
  // Tắt bớt 1 mã thì tạo được
  await s.req('PATCH', '/api/codes/' + ids[0], { cookie: a.cookie, json: { active: false } });
  assert.equal((await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn/4' } })).status, 200);
  // Bật lại khi đã đủ → bị chặn
  assert.equal((await s.req('PATCH', '/api/codes/' + ids[0], { cookie: a.cookie, json: { active: true } })).status, 403);

  // Tính năng Pro bị chặn với tài khoản miễn phí
  for (const json of [{ password: '1234' }, { slug: 'quan-ca-phe' }, { scanLimit: 10 }, { expiresAt: s.clock.t + DAY }]) {
    assert.equal((await s.req('PATCH', '/api/codes/' + ids[1], { cookie: a.cookie, json })).status, 403, JSON.stringify(json));
  }
  r = await s.req('GET', '/api/codes/' + ids[1] + '/export.csv', { cookie: a.cookie });
  assert.equal(r.status, 403);

  // Lên Pro: tạo thêm, đặt tên riêng, mật khẩu…
  s.db.data.users[a.u.id].proUntil = s.clock.t + 10 * DAY;
  for (let i = 0; i < 3; i++) { s.clock.t += 1000; await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'b.vn/' + i } }); }
  r = await s.req('PATCH', '/api/codes/' + ids[1], { cookie: a.cookie, json: { slug: 'Quan-Ca-Phe' } });
  assert.equal(r.data.code.slug, 'quan-ca-phe');
  assert.equal((await s.req('GET', '/q/quan-ca-phe', { headers: { 'user-agent': ANDROID } })).status, 302);
  assert.equal((await s.req('PATCH', '/api/codes/' + ids[2], { cookie: a.cookie, json: { slug: 'quan-ca-phe' } })).status, 409);
  assert.equal((await s.req('PATCH', '/api/codes/' + ids[2], { cookie: a.cookie, json: { slug: 'admin' } })).status, 400);
  r = await s.req('GET', '/api/codes/' + ids[1] + '/export.csv', { cookie: a.cookie });
  assert.equal(r.status, 200);
  assert.match(r.text, /^﻿Ngày,Lượt quét/);

  // Hết Pro: 6 mã đang bật > 3 → 3 mã cũ nhất vẫn chạy, mã mới tạm dừng (sau 3 ngày ân hạn)
  s.clock.t += 11 * DAY;
  a.cookie = s.cookieFor(a.u);
  let list = (await s.req('GET', '/api/codes', { cookie: a.cookie })).data.codes;
  assert.ok(list.every((c) => c.state !== 'quota'), 'còn trong 3 ngày ân hạn');
  s.clock.t += 3 * DAY;
  a.cookie = s.cookieFor(a.u);
  list = (await s.req('GET', '/api/codes', { cookie: a.cookie })).data.codes;
  const paused = list.filter((c) => c.state === 'quota');
  assert.equal(paused.length, 3);
  assert.ok(paused.every((c) => c.target.startsWith('https://b.vn/')), 'mã tạo sau cùng bị tạm dừng trước');
  const pq = await s.req('GET', '/q/' + paused[0].slug, { headers: { 'user-agent': ANDROID } });
  assert.match(pq.text, /gói dịch vụ/);
});

test('Mật khẩu, ngày hết hạn, giới hạn lượt quét', async (t) => {
  const s = await setup(t);
  const a = s.user('a@x.vn', { proUntil: Date.parse('2027-01-01') });
  const c = (await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn', password: 'bimat123', scanLimit: 2 } })).data.code;
  assert.equal(c.hasPassword, true);

  let r = await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } });
  assert.equal(r.status, 200);
  assert.match(r.text, /type="password"/);
  r = await s.req('POST', '/q/' + c.slug, { form: { password: 'sai' }, headers: { 'user-agent': ANDROID } });
  assert.equal(r.status, 401);
  r = await s.req('POST', '/q/' + c.slug, { form: { password: 'bimat123' }, headers: { 'user-agent': ANDROID } });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  r = await s.req('GET', '/q/' + c.slug, { cookie, headers: { 'user-agent': ANDROID } });
  assert.equal(r.status, 302);
  await s.req('GET', '/q/' + c.slug, { cookie, headers: { 'user-agent': IPHONE } });
  // Đủ 2 lượt → dừng
  r = await s.req('GET', '/q/' + c.slug, { cookie, headers: { 'user-agent': ANDROID } });
  assert.match(r.text, /đủ lượt quét/);

  // Bỏ giới hạn, đặt ngày hết hạn đã qua
  await s.req('PATCH', '/api/codes/' + c.id, { cookie: a.cookie, json: { scanLimit: 0, password: '', expiresAt: s.clock.t - 1000 } });
  r = await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } });
  assert.equal(r.status, 410);
  await s.req('PATCH', '/api/codes/' + c.id, { cookie: a.cookie, json: { expiresAt: null } });
  assert.equal((await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } })).status, 302);
});

test('Quản trị khóa mã vi phạm: người quét thấy trang khóa, chủ mã không sửa được', async (t) => {
  const s = await setup(t);
  const admin = s.user('admin@x.vn', { role: 'admin' });
  const a = s.user('a@x.vn');
  const c = (await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'lua-dao.vn' } })).data.code;
  assert.equal((await s.req('GET', '/api/admin/codes?q=lua-dao', { cookie: a.cookie })).status, 403);
  const found = (await s.req('GET', '/api/admin/codes?q=lua-dao', { cookie: admin.cookie })).data.codes;
  assert.equal(found.length, 1);
  assert.equal(found[0].owner, 'a@x.vn');
  await s.req('PATCH', '/api/admin/codes/' + c.id, { cookie: admin.cookie, json: { blocked: true } });
  const r = await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } });
  assert.equal(r.status, 410);
  assert.match(r.text, /bị khóa/);
  assert.equal((await s.req('PATCH', '/api/codes/' + c.id, { cookie: a.cookie, json: { active: true } })).status, 403);
  const ov = await s.req('GET', '/api/admin/overview', { cookie: admin.cookie });
  assert.equal(ov.data.counts.codes, 1);
  assert.equal(ov.data.counts.codesBlocked, 1);
});

test('Mua Pro: đơn VietQR, webhook SePay cộng thời hạn, chuyển thiếu cộng dồn, chống gửi trùng', async (t) => {
  const s = await setup(t);
  const admin = s.user('admin@x.vn', { role: 'admin' });
  const a = s.user('a@x.vn');
  assert.equal((await s.req('POST', '/api/orders', { cookie: a.cookie, json: { product: 'month' } })).status, 503, 'chưa bật thanh toán');
  await s.req('PUT', '/api/admin/settings', { cookie: admin.cookie, json: { payment: { enabled: true, bankId: 'MBB', accountNo: '0988392321', accountName: 'nguyen van manh', priceMonth: 49000, priceYear: 390000 } } });

  const cfg = (await s.req('GET', '/api/config')).data;
  assert.deepEqual(cfg.shop, { enabled: true, month: { price: 49000 }, year: { price: 390000 } });
  assert.equal(cfg.freeLimit, 3);

  const o = (await s.req('POST', '/api/orders', { cookie: a.cookie, json: { product: 'year' } })).data.order;
  assert.match(o.code, /^MTQR[A-Z2-9]{6}$/);
  assert.equal(o.amount, 390000);
  assert.match(o.pay.qrUrl, /^https:\/\/img\.vietqr\.io\/image\/MB-0988392321-compact2\.png\?amount=390000&addInfo=MTQR/);

  const hook = (json, key) => s.req('POST', '/api/payments/webhook', { json, headers: { authorization: 'Apikey ' + (key || 'k'.repeat(24)) } });
  assert.equal((await hook({ id: 1, transferType: 'in', transferAmount: 390000, content: o.code }, 'sai')).status, 401);
  let r = await hook({ id: 1, transferType: 'in', transferAmount: 200000, content: 'CK ' + o.code.slice(0, 4) + ' ' + o.code.slice(4).toLowerCase() });
  assert.equal(r.data.result, 'underpaid');
  r = await hook({ id: 2, transferType: 'in', transferAmount: 190000, content: o.code + ' bu them' });
  assert.equal(r.data.result, 'paid');
  assert.equal((await hook({ id: 2, transferType: 'in', transferAmount: 190000, content: o.code })).data.result, 'duplicate');

  const me = (await s.req('GET', '/api/me', { cookie: a.cookie })).data;
  assert.equal(me.user.pro, true);
  assert.equal(me.user.proUntil, s.clock.t + 366 * DAY);
  assert.equal(me.quota.limit, 100);

  // Mua thêm khi còn hạn → cộng nối tiếp
  const o2 = (await s.req('POST', '/api/orders', { cookie: a.cookie, json: { product: 'month' } })).data.order;
  await s.req('POST', '/api/admin/orders/' + o2.id + '/confirm', { cookie: admin.cookie });
  assert.equal(s.db.data.users[a.u.id].proUntil, s.clock.t + (366 + 31) * DAY);
});

test('Xóa tài khoản xóa luôn mã động; trang tĩnh có header bảo mật', async (t) => {
  const s = await setup(t);
  const admin = s.user('admin@x.vn', { role: 'admin' });
  const a = s.user('a@x.vn');
  const c = (await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn' } })).data.code;
  assert.equal((await s.req('DELETE', '/api/me', { cookie: a.cookie })).status, 200);
  assert.equal((await s.req('GET', '/q/' + c.slug)).status, 404);
  assert.equal(Object.keys(s.db.data.codes).length, 0);
  void admin;

  const home = await s.req('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.equal((await s.req('GET', '/../server/app.js')).status, 404);
  assert.equal((await s.req('GET', '/.env')).status, 404);
});

test('Báo cáo mã vi phạm: ai cũng gửi được, không lưu IP, quản trị viên khóa mã từ báo cáo', async (t) => {
  const s = await setup(t);
  const admin = s.user('admin@x.vn', { role: 'admin' });
  const a = s.user('a@x.vn');
  const c = (await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'lua-dao.vn/dang-nhap' } })).data.code;

  // Không cần đăng nhập nhưng vẫn phải qua chống CSRF
  assert.equal((await s.req('POST', '/api/reports', { noCsrf: true, json: { link: c.shortUrl } })).status, 403);
  assert.equal((await s.req('POST', '/api/reports', { json: { link: 'khongcoma' } })).status, 404);
  assert.equal((await s.req('POST', '/api/reports', { json: { link: 'https://x.vn/a/b' } })).status, 400);
  let r = await s.req('POST', '/api/reports', { json: { link: c.shortUrl, reason: 'scam', detail: 'Giả   ngân hàng', contact: '0988' } });
  assert.equal(r.status, 200);
  // Cùng người báo lại trong ngày (dán thiếu https://, thừa dấu /): nhận nhưng không ghi trùng
  assert.equal((await s.req('POST', '/api/reports', { json: { link: c.shortUrl.replace(/^https?:\/\//, '') + '/', reason: 'scam' } })).status, 200);
  assert.equal(Object.keys(s.db.data.reports).length, 1);
  const saved = Object.values(s.db.data.reports)[0];
  assert.equal(saved.detail, 'Giả ngân hàng');
  assert.equal(saved.target, 'https://lua-dao.vn/dang-nhap');
  assert.ok(!JSON.stringify(saved).includes('127.0.0.1'), 'không lưu IP');

  assert.equal((await s.req('GET', '/api/admin/reports', { cookie: a.cookie })).status, 403);
  assert.equal((await s.req('GET', '/api/admin/overview', { cookie: admin.cookie })).data.counts.reportsOpen, 1);
  let list = (await s.req('GET', '/api/admin/reports', { cookie: admin.cookie })).data;
  assert.equal(list.open, 1);
  assert.equal(list.reports[0].code.owner, 'a@x.vn');
  assert.equal(list.reports[0].reasonText, 'Lừa đảo, giả mạo');

  r = await s.req('POST', '/api/admin/reports/' + list.reports[0].id, { cookie: admin.cookie, json: { action: 'block' } });
  assert.equal(r.data.open, 0);
  assert.equal((await s.req('GET', '/q/' + c.slug, { headers: { 'user-agent': ANDROID } })).status, 410);
  list = (await s.req('GET', '/api/admin/reports?status=closed', { cookie: admin.cookie })).data;
  assert.equal(list.reports[0].status, 'blocked');
  assert.equal(list.reports[0].closedBy, 'admin@x.vn');
  // Mã đã khóa: báo tiếp không thành việc mới cho quản trị viên
  r = await s.req('POST', '/api/reports', { json: { link: c.slug } });
  assert.equal(r.data.already, true);
  assert.equal(Object.keys(s.db.data.reports).length, 1);

  // Báo sai → bỏ qua, mã vẫn chạy; báo cáo đã xử lý tự xóa sau 90 ngày
  const b = (await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'tiem-banh.vn' } })).data.code;
  await s.req('POST', '/api/reports', { json: { link: b.shortUrl, reason: 'other' } });
  const id = (await s.req('GET', '/api/admin/reports', { cookie: admin.cookie })).data.reports[0].id;
  assert.equal((await s.req('POST', '/api/admin/reports/' + id, { cookie: admin.cookie, json: { action: 'xoa' } })).status, 400);
  await s.req('POST', '/api/admin/reports/' + id, { cookie: admin.cookie, json: { action: 'dismiss' } });
  assert.equal(s.db.data.codes[b.id].blocked, false);
  assert.equal((await s.req('GET', '/q/' + b.slug, { headers: { 'user-agent': ANDROID } })).status, 302);
  s.clock.t += 91 * DAY;
  list = (await s.req('GET', '/api/admin/reports?status=closed', { cookie: s.cookieFor(admin.u) })).data;
  assert.equal(list.reports.length, 0);
});

test('Trang phụ: robots.txt, sitemap, điều khoản, 404 dễ đọc; tên miền ngắn chỉ phục vụ mã động', async (t) => {
  const s = await setup(t, { SHORT_URL: 'http://mtqr.test' });
  let r = await s.req('GET', '/robots.txt');
  assert.match(r.text, /Disallow: \/q\//);
  assert.match(r.text, /Sitemap: http:\/\/localhost:5180\/sitemap\.xml/);
  r = await s.req('GET', '/sitemap.xml');
  assert.match(r.text, /<loc>http:\/\/localhost:5180\/bao-mat\.html<\/loc>/);
  for (const p of ['/dieu-khoan', '/dieu-khoan.html', '/bao-mat', '/sw.js']) assert.equal((await s.req('GET', p)).status, 200, p);
  r = await s.req('GET', '/khong-co', { headers: { accept: 'text/html,*/*' } });
  assert.equal(r.status, 404);
  assert.match(r.text, /Không tìm thấy trang/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await s.req('GET', '/assets/khong-co.png')).text, 'Không tìm thấy');

  const a = s.user('a@x.vn');
  const c = (await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn' } })).data.code;
  assert.equal(c.shortUrl, 'http://mtqr.test/q/' + c.slug);
  r = await s.getAs('mtqr.test', '/q/' + c.slug, { 'user-agent': ANDROID });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, 'https://a.vn/');
  assert.equal((await s.getAs('mtqr.test', '/assets/css/scan.css')).status, 200);
  r = await s.getAs('mtqr.test', '/?login=ok');
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, 'http://localhost:5180/?login=ok');
  assert.equal((await s.getAs('localhost:5180', '/')).status, 200);
});

/* ---------- Miễn phí & giới thiệu ---------- */
test('Mở Pro miễn phí: tài khoản dùng như Pro, mã tạo lúc miễn phí không bị tạm dừng, giữ vĩnh viễn, lời giới thiệu', async (t) => {
  const s = await setup(t);
  const admin = s.user('admin@x.vn', { role: 'admin' });
  const a = s.user('a@x.vn');
  const b = s.user('b@x.vn');
  assert.equal((await s.req('PUT', '/api/admin/promo/free', { cookie: a.cookie, json: { free: null } })).status, 403);
  let cfg = (await s.req('GET', '/api/config')).data;
  assert.equal(cfg.free, null);
  assert.ok(cfg.brand.products.length === 3 && !cfg.brand.products.some((p) => /qr\.manhtool/.test(p.url)), 'không tự giới thiệu chính mình');

  // cấu hình sai bị chặn
  assert.match((await s.req('PUT', '/api/admin/promo/free', { cookie: admin.cookie, json: { free: { features: ['xyz'] } } })).data.error, /ít nhất một/);

  // mở 2 ngày, không giữ vĩnh viễn
  let r = await s.req('PUT', '/api/admin/promo/free', { cookie: admin.cookie, json: { free: { features: ['pro'], endsAt: s.clock.t + 2 * DAY, keep: false } } });
  assert.equal(r.status, 200);
  assert.equal(r.data.running, true);
  cfg = (await s.req('GET', '/api/config')).data;
  assert.deepEqual(cfg.free.features, ['pro']);
  let me = (await s.req('GET', '/api/me', { cookie: a.cookie })).data;
  assert.equal(me.user.pro, true);
  assert.equal(me.user.paid, false);
  assert.equal(me.quota.limit, 100);
  assert.deepEqual(me.user.freeKeep, [], 'không giữ vĩnh viễn');
  // tạo 5 mã động (vượt hạn mức miễn phí 3) + dùng tính năng Pro
  const ids = [];
  for (let i = 0; i < 5; i++) { s.clock.t += 1000; ids.push((await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn/' + i } })).data.code.id); }
  assert.equal((await s.req('PATCH', '/api/codes/' + ids[0], { cookie: a.cookie, json: { slug: 'tiem-banh' } })).status, 200);
  assert.equal(Object.values(s.db.data.codes).filter((c) => c.freeAt).length, 5);

  // hết chương trình: trở lại gói miễn phí nhưng 5 mã đã in vẫn chạy
  s.clock.t += 6 * DAY;
  a.cookie = s.cookieFor(a.u);
  assert.equal((await s.req('GET', '/api/config')).data.free, null);
  me = (await s.req('GET', '/api/me', { cookie: a.cookie })).data;
  assert.equal(me.user.pro, false);
  const list = (await s.req('GET', '/api/codes', { cookie: a.cookie })).data.codes;
  assert.ok(list.every((c) => c.state === 'active'), 'mã tạo lúc miễn phí không bị tạm dừng');
  assert.equal((await s.req('GET', '/q/tiem-banh', { headers: { 'user-agent': ANDROID } })).status, 302);
  assert.equal((await s.req('POST', '/api/codes', { cookie: a.cookie, json: { target: 'a.vn/6' } })).status, 403, 'không tạo thêm được');

  // chương trình có giữ vĩnh viễn: tài khoản mở trang lúc đó được giữ Pro sau khi kết thúc
  admin.cookie = s.cookieFor(admin.u);
  await s.req('PUT', '/api/admin/promo/free', { cookie: admin.cookie, json: { free: { features: ['pro'], endsAt: s.clock.t + DAY, keep: true } } });
  b.cookie = s.cookieFor(b.u);
  assert.deepEqual((await s.req('GET', '/api/me', { cookie: b.cookie })).data.user.freeKeep, ['pro']);
  s.clock.t += 2 * DAY;
  b.cookie = s.cookieFor(b.u);
  me = (await s.req('GET', '/api/me', { cookie: b.cookie })).data;
  assert.equal(me.user.pro, true);
  assert.equal(me.user.paid, false);
  admin.cookie = s.cookieFor(admin.u);
  r = await s.req('GET', '/api/admin/promo', { cookie: admin.cookie });
  assert.equal(r.data.stats[0].value, 1);
  assert.equal(r.data.stats[1].value, 5);

  // lời giới thiệu: lọc dữ liệu lạ
  r = await s.req('PUT', '/api/admin/promo/brand', { cookie: admin.cookie, json: { brand: { name: 'X', ctaUrl: 'javascript:alert(1)', frequency: 'hourly', products: [{ name: 'A', icon: 'qr', url: 'ftp://a' }] } } });
  assert.equal(r.data.brand.ctaUrl, '');
  assert.equal(r.data.brand.frequency, 'day');
  assert.equal(r.data.brand.products[0].url, '');
  assert.equal((await s.req('GET', '/api/config')).data.brand.name, 'X');
});
