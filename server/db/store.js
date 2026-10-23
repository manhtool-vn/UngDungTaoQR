/* Lưu dữ liệu vào 1 file JSON (data/db.json). Đủ dùng cho vài nghìn tài khoản và vài chục nghìn mã;
   ghi qua file tạm rồi đổi tên để không bao giờ để lại file hỏng nửa chừng.
   Lượt quét đến dồn dập nên dùng saveSoon() (gom lại ghi 1 lần sau 2 giây) thay vì ghi ngay.
   Muốn chuyển sang PostgreSQL/SQLite sau này: chỉ cần viết lại module này với cùng giao diện. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 1;
const SOON_MS = 2000;

function defaults() {
  return {
    meta: { schema: SCHEMA, createdAt: new Date().toISOString() },
    // Khóa ký JWT cho bản chạy thử (khi chưa đặt JWT_SECRET)
    secret: crypto.randomBytes(48).toString('base64url'),
    settings: {
      googleClientId: '', googleClientSecret: '', googleLoginEnabled: true, registrationOpen: true,
      freeDynamicLimit: 3,  // số mã động tài khoản miễn phí được dùng
      proDynamicLimit: 100, // số mã động tài khoản Pro được dùng
      // Thanh toán chuyển khoản VietQR (đối soát tự động qua webhook, ví dụ SePay)
      payment: { enabled: false, bankId: '', accountNo: '', accountName: '', priceMonth: 29000, priceYear: 290000 }
    },
    users: {},          // id → hồ sơ + gói Pro (proUntil)
    codes: {},          // id → mã QR động + thống kê lượt quét
    orders: {},         // id → đơn mua gói Pro
    payments: {},       // mã giao dịch ngân hàng → đã xử lý (chống xử lý trùng) + tiền chưa khớp đơn
    seen: { day: '', keys: {} }, // khách đã quét trong ngày (băm) để đếm lượt quét không trùng
    refreshTokens: {},  // sha256(token) → { userId, family, expiresAt, usedAt, ua, createdAt }
    oauthStates: {},    // sha256(state) → { verifier, returnTo, expiresAt }
    reports: {},        // id → báo cáo mã QR động vi phạm (người quét gửi, quản trị viên xử lý)
    audit: []           // nhật ký thao tác quản trị (giữ 200 dòng gần nhất)
  };
}

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let data = defaults();
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = Object.assign(defaults(), raw);
    data.settings = Object.assign(defaults().settings, raw.settings || {});
    data.settings.payment = Object.assign(defaults().settings.payment, (raw.settings && raw.settings.payment) || {});
  }

  let timer = null;

  function save() {
    if (timer) { clearTimeout(timer); timer = null; }
    const tmp = file + '.tmp';
    const text = JSON.stringify(data);
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      // Windows đôi khi khóa file (phần mềm diệt virus) → ghi thẳng
      fs.writeFileSync(file, text, { mode: 0o600 });
      try { fs.unlinkSync(tmp); } catch (e2) { /* bỏ qua */ }
    }
  }

  // Ghi gộp: nhiều lượt quét trong 2 giây chỉ ghi file 1 lần
  function saveSoon() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; save(); }, SOON_MS);
    if (timer.unref) timer.unref();
  }

  // Ghi nốt phần đang chờ (gọi khi tắt máy chủ)
  function flush() { if (timer) save(); }

  // Dọn token / state hết hạn
  function prune(now) {
    let changed = false;
    for (const [k, t] of Object.entries(data.refreshTokens)) {
      // Token đã dùng giữ thêm 1 ngày để còn phát hiện bị dùng lại
      const dead = t.expiresAt <= now || (t.usedAt && t.usedAt + 86400000 <= now) || !data.users[t.userId];
      if (dead) { delete data.refreshTokens[k]; changed = true; }
    }
    for (const [k, s] of Object.entries(data.oauthStates)) if (s.expiresAt <= now) { delete data.oauthStates[k]; changed = true; }
    if (changed) save();
  }

  save();
  return { data, save, saveSoon, flush, prune, file };
}

module.exports = { createStore, SCHEMA };
