/* Chương trình mở miễn phí + lời giới thiệu ManhTool (admin → tab "Miễn phí & giới thiệu").
   Chuẩn hoá cấu hình dùng chung với trình duyệt qua public/assets/js/mt-promo.js.
   - settings.free: đang chạy thì mọi tài khoản dùng được gói Pro (users.isPro);
     mã động tạo lúc này không bao giờ bị tạm dừng vì vượt hạn mức (codes.freeAt — khách có thể đã in mã);
     free.keep: tài khoản đăng nhập trong thời gian đó được giữ Pro vĩnh viễn (user.freeKeep).
   - settings.brand: popup giới thiệu hiện cho người dùng bản miễn phí (khách, tài khoản chưa trả tiền). */
'use strict';
const P = require('../../public/assets/js/mt-promo.js');

const FEATURES = [
  { key: 'pro', label: 'Toàn bộ tính năng Pro', hint: 'Thêm mã động, đặt tên đường dẫn, mật khẩu, hẹn ngày tắt, giới hạn lượt quét, thống kê 400 ngày, xuất CSV' }
];
const KEYS = FEATURES.map((f) => f.key);
const BASE = P.defaults('qr', '/assets/img/dsv24h.svg');

function createPromoService({ db, now }) {
  const s = () => db.data.settings;
  const free = () => P.normalizeFree(s().free, KEYS);
  const running = () => P.freeOn(free(), now());
  const brand = () => P.normalizeBrand(s().brand || BASE, BASE);

  // Tài khoản này đang được mở quyền lợi key? (đang chạy chương trình, hoặc được giữ từ chương trình trước)
  function has(user, key) {
    if (!user) return false;
    if (P.freeHas(free(), key, now())) return true;
    return Array.isArray(user.freeKeep) && user.freeKeep.includes(key);
  }
  // Đang chạy chương trình có "giữ vĩnh viễn" → ghi nhận quyền lợi cho tài khoản (gọi khi tài khoản mở trang)
  function claim(user) {
    const f = running();
    if (!user || !f || !f.keep) return false;
    const cur = Array.isArray(user.freeKeep) ? user.freeKeep : [];
    const add = f.features.filter((k) => !cur.includes(k));
    if (!add.length) return false;
    user.freeKeep = cur.concat(add);
    user.freeKeepAt = user.freeKeepAt || now();
    db.save();
    return true;
  }

  function publicInfo() {
    const b = brand();
    return { free: running() || null, brand: b.enabled ? b : null };
  }
  function adminInfo() {
    const all = Object.values(db.data.users);
    const codes = Object.values(db.data.codes || {});
    return {
      free: free(), running: !!running(), brand: brand(),
      stats: [
        { label: 'Tài khoản được giữ Pro vĩnh viễn', value: all.filter((u) => Array.isArray(u.freeKeep) && u.freeKeep.length).length },
        { label: 'Mã động tạo trong thời gian miễn phí', value: codes.filter((c) => c.freeAt).length }
      ]
    };
  }
  function setFree(input) {
    if (input === null) { delete s().free; db.save(); return { ok: true }; }
    const err = P.freeError(input, KEYS, now());
    if (err) return { error: err };
    s().free = P.normalizeFree(input, KEYS);
    db.save();
    return { ok: true };
  }
  function setBrand(input) {
    s().brand = P.normalizeBrand(input, BASE);
    db.save();
    return s().brand;
  }

  return { FEATURES, BASE, has, claim, publicInfo, adminInfo, setFree, setBrand, running, brand };
}

module.exports = { createPromoService, FEATURES };
