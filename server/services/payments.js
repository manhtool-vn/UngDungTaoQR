/* Mua gói Pro (QR động, thống kê) bằng chuyển khoản ngân hàng (VietQR), đối soát tự động qua webhook (định dạng SePay).
   Luồng: người dùng chọn gói → máy chủ tạo đơn có MÃ riêng → người dùng quét QR, nội dung chuyển khoản = MÃ
   → ngân hàng báo SePay → SePay gọi webhook → máy chủ tìm MÃ trong nội dung, đủ tiền thì cộng thời hạn Pro.
   Giá luôn do máy chủ tính, trang chỉ gửi lên mã gói. Mua thêm khi còn hạn → cộng dồn. */
'use strict';
const crypto = require('node:crypto');

const CODE_PREFIX = 'MTQR';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I dễ nhầm khi gõ tay
const CODE_RE = new RegExp(CODE_PREFIX + '[' + CODE_ALPHABET + ']{6}');
const PAY_WINDOW_MS = 30 * 60000;          // QR hiển thị 30 phút
const LATE_ACCEPT_MS = 7 * 86400000;        // chuyển muộn trong 7 ngày vẫn được ghi nhận
const MAX_PENDING_PER_USER = 3;
const PLAN_DAYS = { month: 31, year: 366 };

const BANK_ALIASES = {
  'MBB': 'MB',
  'MBBANK': 'MB',
  'TECHCOMBANK': 'TCB',
  'VIETCOMBANK': 'VCB',
  'VIETINBANK': 'ICB',
  'VTB': 'ICB',
  'VPBANK': 'VPB',
  'TPBANK': 'TPB',
  'SACOMBANK': 'STB',
  'HDBANK': 'HDB',
  'AGRIBANK': 'VBA',
  'AGRI': 'VBA'
};

function cleanBankId(id) {
  const k = String(id || '').trim().toUpperCase();
  return BANK_ALIASES[k] || k;
}

function makeCode() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return CODE_PREFIX + s;
}

// Tìm mã đơn trong nội dung chuyển khoản (ngân hàng hay chèn dấu cách, gạch, đổi chữ hoa/thường)
function findCode(text) {
  const norm = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = CODE_RE.exec(norm);
  return m ? m[0] : null;
}

function createPaymentService({ db, users, now }) {
  const settings = () => db.data.settings.payment;

  /* ---------- Bảng giá ---------- */
  function catalog() {
    const s = settings();
    return {
      month: { id: 'month', name: 'Gói Pro 1 tháng', price: s.priceMonth, days: PLAN_DAYS.month },
      year: { id: 'year', name: 'Gói Pro 12 tháng', price: s.priceYear, days: PLAN_DAYS.year }
    };
  }

  function ready() {
    const s = settings();
    return !!(s.enabled && s.bankId && s.accountNo && s.accountName);
  }

  // Thông tin công khai cho trang (không có gì bí mật)
  function publicInfo() {
    const c = catalog();
    return { enabled: ready(), month: { price: c.month.price }, year: { price: c.year.price } };
  }

  /* ---------- Đơn hàng ---------- */
  function statusOf(o) {
    if (o.status === 'pending' && o.expiresAt <= now()) return 'expired';
    return o.status;
  }

  function instructions(o) {
    const s = settings();
    const bank = cleanBankId(s.bankId);
    const qr = 'https://img.vietqr.io/image/' + encodeURIComponent(bank) + '-' + encodeURIComponent(s.accountNo) + '-compact2.png?' +
      new URLSearchParams({ amount: String(o.amount), addInfo: o.code, accountName: s.accountName }).toString();
    return { bankId: bank, accountNo: s.accountNo, accountName: s.accountName, amount: o.amount, content: o.code, qrUrl: qr };
  }

  function toPublic(o, withPay) {
    const out = { id: o.id, code: o.code, product: o.product, title: o.title, amount: o.amount, status: statusOf(o), createdAt: o.createdAt, expiresAt: o.expiresAt, paidAt: o.paidAt || null };
    if (withPay && statusOf(o) === 'pending') out.pay = instructions(o);
    return out;
  }

  function create(user, product) {
    if (!ready()) return { status: 503, error: 'Thanh toán đang tạm tắt, vui lòng liên hệ ManhTool' };
    prune();
    const p = catalog()[product];
    if (!p) return { status: 400, error: 'Gói không hợp lệ' };
    const mine = Object.values(db.data.orders).filter((o) => o.userId === user.id && statusOf(o) === 'pending');
    // Đang có đơn chờ cho đúng gói này → dùng lại, khỏi tạo mã mới
    const same = mine.find((o) => o.product === p.id && o.amount === p.price);
    if (same) return { order: same };
    if (mine.length >= MAX_PENDING_PER_USER) return { status: 429, error: 'Bạn đang có vài đơn chờ thanh toán, hãy hủy bớt rồi thử lại' };
    let code;
    do { code = makeCode(); } while (Object.values(db.data.orders).some((o) => o.code === code));
    const o = {
      id: crypto.randomUUID(), code, userId: user.id, email: user.email, product: p.id, title: p.name, amount: p.price, days: p.days,
      status: 'pending', createdAt: now(), expiresAt: now() + PAY_WINDOW_MS, paidAt: null, paidVia: null, paidAmount: 0
    };
    db.data.orders[o.id] = o;
    db.save();
    return { order: o };
  }

  // Cộng thời hạn Pro theo gói đã thanh toán
  function fulfill(o, via, amount, actor) {
    if (o.status === 'paid') return false;
    o.status = 'paid';
    o.paidAt = now();
    o.paidVia = via;
    o.paidAmount = amount || o.amount;
    const u = db.data.users[o.userId];
    if (u) users.extendPro(u, o.days || PLAN_DAYS[o.product] || 31);
    users.audit(actor || null, 'Thanh toán ' + o.code + ' (' + o.title + ', ' + o.paidAmount + 'đ, ' + via + ')', o.email);
    return true;
  }

  /* ---------- Webhook ngân hàng (định dạng SePay) ----------
     Trường dùng: id (mã giao dịch), transferType ('in' tiền vào), transferAmount (số tiền),
     content / description (nội dung), code (mã thanh toán SePay tự tách nếu có cấu hình). */
  function handleWebhook(body) {
    if (!body || typeof body !== 'object') return { status: 400, error: 'Dữ liệu không hợp lệ' };
    const txId = String(body.id != null ? body.id : body.referenceCode || '').slice(0, 64);
    if (!txId) return { status: 400, error: 'Thiếu mã giao dịch' };
    // Chỉ quan tâm tiền vào
    if (body.transferType && String(body.transferType).toLowerCase() !== 'in') return { ok: true, result: 'ignored' };
    if (db.data.payments[txId]) return { ok: true, result: 'duplicate' }; // ngân hàng / SePay gửi lại → bỏ qua

    const amount = Math.floor(Number(body.transferAmount) || 0);
    const content = String(body.content || body.description || '').slice(0, 300);
    const code = findCode(body.code) || findCode(content);
    const rec = { at: now(), amount, content, code, orderId: null, result: 'unmatched' };
    const order = code && Object.values(db.data.orders).find((o) => o.code === code);

    if (order && order.status === 'paid') {
      rec.orderId = order.id;
      rec.result = 'already_paid'; // chuyển 2 lần → quản trị viên tự hoàn tiền
    } else if (order && (order.status === 'pending' || order.status === 'cancelled') && now() - order.createdAt <= LATE_ACCEPT_MS) {
      // Kể cả đơn đã hủy: tiền đã vào thì vẫn kích hoạt cho người mua
      rec.orderId = order.id;
      const paid = (order.paidAmount || 0) + amount;
      if (paid >= order.amount) {
        fulfill(order, 'webhook', paid);
        rec.result = 'paid';
      } else {
        rec.result = 'underpaid';
        order.paidAmount = paid; // chuyển thiếu rồi chuyển bù → cộng dồn
      }
    } else if (order) {
      rec.orderId = order.id;
      rec.result = 'order_closed';
    }
    db.data.payments[txId] = rec;
    db.save();
    return { ok: true, result: rec.result };
  }

  function cancel(order) {
    if (statusOf(order) !== 'pending' && statusOf(order) !== 'expired') return false;
    order.status = 'cancelled';
    db.save();
    return true;
  }

  // Đơn chờ quá 7 ngày → đánh dấu hết hạn hẳn
  function prune() {
    let changed = false;
    Object.values(db.data.orders).forEach((o) => {
      if (o.status === 'pending' && now() - o.createdAt > LATE_ACCEPT_MS) { o.status = 'expired'; changed = true; }
    });
    if (changed) db.save();
  }

  return { catalog, ready, publicInfo, create, toPublic, fulfill, handleWebhook, cancel, statusOf, prune, CODE_PREFIX };
}

module.exports = { createPaymentService, findCode, makeCode, cleanBankId, CODE_PREFIX };
