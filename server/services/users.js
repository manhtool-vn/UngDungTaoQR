/* Người dùng: tạo / liên kết từ hồ sơ Google, gói Pro, dữ liệu trả ra ngoài, nhật ký quản trị. */
'use strict';
const crypto = require('node:crypto');

function createUserService({ config, db, now }) {
  const iso = () => new Date(now()).toISOString();

  // Pro còn hạn. Quản trị viên luôn được dùng như Pro để kiểm thử.
  function isPro(u) { return !!u && (u.role === 'admin' || (u.proUntil || 0) > now()); }

  // Số mã động được phép bật cùng lúc
  function limitFor(pro) {
    const s = db.data.settings;
    return pro ? Math.max(1, Number(s.proDynamicLimit) || 100) : Math.max(0, Number(s.freeDynamicLimit) || 0);
  }
  function codeLimit(u) { return limitFor(isPro(u)); }

  // Chỉ những trường này được gửi về trình duyệt
  function toPublic(u) {
    return {
      id: u.id, email: u.email, name: u.name, picture: u.picture || '', role: u.role,
      pro: isPro(u), proUntil: u.proUntil || null, codeLimit: codeLimit(u), createdAt: u.createdAt
    };
  }

  function admins() { return Object.values(db.data.users).filter((u) => u.role === 'admin' && u.active); }

  // Tìm theo Google ID → theo email → tạo mới. Trả về { user } hoặc { error }
  function fromGoogle(profile) {
    const email = String(profile.email || '').trim().toLowerCase();
    if (!profile.sub || !email) return { error: 'Tài khoản Google không cung cấp email' };
    if (profile.email_verified === false) return { error: 'Email Google chưa được xác minh' };

    const all = Object.values(db.data.users);
    let user = all.find((u) => u.googleId === profile.sub) || all.find((u) => u.email === email);
    if (!user) {
      const first = all.length === 0;
      if (!first && db.data.settings.registrationOpen === false && !config.adminEmails.includes(email)) {
        return { error: 'Hệ thống đang tạm đóng đăng ký tài khoản mới' };
      }
      user = {
        id: crypto.randomUUID(), googleId: profile.sub, email,
        name: String(profile.name || email.split('@')[0]).slice(0, 100),
        picture: '',
        // Tài khoản đầu tiên hoặc email trong ADMIN_EMAILS là quản trị viên
        role: first || config.adminEmails.includes(email) ? 'admin' : 'user',
        proUntil: null, active: true, tokenVersion: 0, createdAt: iso(), lastLoginAt: null
      };
      db.data.users[user.id] = user;
      audit(null, 'Tạo tài khoản', email);
    }
    if (!user.active) return { error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ManhTool.' };
    user.googleId = profile.sub;
    if (profile.name) user.name = String(profile.name).slice(0, 100);
    // Chỉ nhận ảnh đại diện từ máy chủ ảnh của Google
    if (typeof profile.picture === 'string' && /^https:\/\/[\w.-]+\.googleusercontent\.com\//.test(profile.picture)) user.picture = profile.picture.slice(0, 500);
    if (config.adminEmails.includes(email)) user.role = 'admin';
    user.lastLoginAt = iso();
    return { user };
  }

  // Cộng thêm thời hạn Pro (tính từ hôm nay nếu đã hết hạn)
  function extendPro(u, days) {
    const from = Math.max(now(), u.proUntil || 0);
    u.proUntil = from + days * 86400000;
    return u.proUntil;
  }

  function audit(actor, action, target) {
    db.data.audit.unshift({ at: iso(), actor: actor ? actor.email : 'hệ thống', action, target: target || '' });
    db.data.audit.length = Math.min(db.data.audit.length, 200);
  }

  // Tổng hợp cho trang quản trị
  function summary(u, devices) {
    const codes = Object.values(db.data.codes).filter((c) => c.userId === u.id);
    const scans = codes.reduce((s, c) => s + c.stats.total, 0);
    return Object.assign(toPublic(u), { active: !!u.active, lastLoginAt: u.lastLoginAt, codes: codes.length, scans, sessions: devices });
  }

  return { toPublic, fromGoogle, audit, admins, summary, isPro, codeLimit, limitFor, extendPro, iso };
}

module.exports = { createUserService };
