/* Báo cáo mã QR động vi phạm (lừa đảo, mã độc, cờ bạc…): ai cũng gửi được, không cần đăng nhập.
   Quản trị viên xem ở trang quản trị rồi khóa mã hoặc bỏ qua. Dịch vụ chuyển hướng hay bị kẻ xấu lợi dụng,
   để lâu một mã lừa đảo thì trình duyệt có thể chặn cả tên miền ngắn, làm hỏng mọi mã đã in của khách khác.
   Không lưu IP: chỉ lưu bản băm trong ngày để một người báo nhiều lần cùng mã không bị ghi trùng. */
'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('../lib/http');
const { dayKey } = require('./codes');

const REASONS = { scam: 'Lừa đảo, giả mạo', malware: 'Mã độc, virus', gambling: 'Cờ bạc', adult: 'Nội dung người lớn', other: 'Lý do khác' };
const MAX_OPEN = 2000;
const KEEP_CLOSED_MS = 90 * 86400000;

function createReportService({ config, db, codes, users, now }) {
  const all = () => db.data.reports;

  // Nhận đường dẫn ngắn đầy đủ (…/q/abc123, có hoặc không https://) hoặc chỉ tên mã
  function slugFrom(v) {
    const s = String(v || '').trim();
    const m = /\/q\/([A-Za-z0-9-]{3,32})\/?(?:[?#].*)?$/.exec(s) || /^([A-Za-z0-9-]{3,32})$/.exec(s);
    return m ? m[1].toLowerCase() : '';
  }

  // Báo cáo đã xử lý quá 90 ngày → xóa; mã đã bị xóa → đóng báo cáo
  function prune() {
    let changed = false;
    Object.values(all()).forEach((r) => {
      if (r.status === 'open' && !db.data.codes[r.codeId]) { r.status = 'gone'; r.closedAt = now(); changed = true; }
      if (r.status !== 'open' && r.closedAt && now() - r.closedAt > KEEP_CLOSED_MS) { delete all()[r.id]; changed = true; }
    });
    return changed;
  }

  function create(body, ip) {
    const slug = slugFrom(body.link);
    if (!slug) throw new HttpError(400, 'Hãy dán đường dẫn của mã QR, ví dụ ' + config.shortUrl.replace(/^https?:\/\//, '') + '/q/abc123');
    const c = codes.bySlug(slug);
    if (!c) throw new HttpError(404, 'Không tìm thấy mã QR động này. Kiểm tra lại đường dẫn.');
    if (c.blocked) return { already: true };
    prune();
    const key = crypto.createHash('sha256').update(db.data.secret + '|report|' + c.id + '|' + ip + '|' + dayKey(now())).digest('base64url').slice(0, 16);
    if (Object.values(all()).some((r) => r.key === key)) return { duplicate: true };
    if (Object.values(all()).filter((r) => r.status === 'open').length >= MAX_OPEN) throw new HttpError(503, 'Đang nhận quá nhiều báo cáo, vui lòng thử lại sau');
    const r = {
      id: crypto.randomUUID(), codeId: c.id, slug: c.slug, target: c.target,
      reason: REASONS[body.reason] ? body.reason : 'other',
      detail: String(body.detail || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      contact: String(body.contact || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      key, at: now(), status: 'open', closedAt: null, closedBy: null
    };
    all()[r.id] = r;
    db.save();
    return { report: r };
  }

  function openCount() { return Object.values(all()).filter((r) => r.status === 'open').length; }

  // Danh sách cho trang quản trị, kèm tình trạng hiện tại của mã bị báo cáo
  function list(status) {
    if (prune()) db.save();
    const rk = codes.ranks();
    const perCode = {};
    Object.values(all()).forEach((r) => { if (r.status === 'open') perCode[r.codeId] = (perCode[r.codeId] || 0) + 1; });
    return Object.values(all())
      .filter((r) => (status === 'closed' ? r.status !== 'open' : r.status === 'open'))
      .sort((a, b) => (status === 'closed' ? b.closedAt - a.closedAt : b.at - a.at))
      .slice(0, 300)
      .map((r) => {
        const c = db.data.codes[r.codeId];
        const owner = c && db.data.users[c.userId];
        return {
          id: r.id, slug: r.slug, reason: r.reason, reasonText: REASONS[r.reason], detail: r.detail, contact: r.contact,
          at: r.at, status: r.status, closedAt: r.closedAt, closedBy: r.closedBy,
          reportedTarget: r.target, sameCode: perCode[r.codeId] || 0,
          code: c ? Object.assign(codes.toPublic(c, false, rk), { owner: owner ? owner.email : '(đã xóa)' }) : null
        };
      });
  }

  // Đóng mọi báo cáo đang chờ của 1 mã (khi quản trị viên khóa mã, kể cả khóa từ thẻ Mã động)
  function closeFor(codeId, status, actor) {
    Object.values(all()).forEach((r) => {
      if (r.codeId === codeId && r.status === 'open') { r.status = status; r.closedAt = now(); r.closedBy = actor ? actor.email : null; }
    });
  }

  // block: khóa mã + đóng mọi báo cáo về mã đó · dismiss: bỏ qua riêng báo cáo này
  function resolve(r, action, actor) {
    if (action === 'block') {
      const c = db.data.codes[r.codeId];
      if (c && !c.blocked) {
        c.blocked = true;
        users.audit(actor, 'Khóa mã ' + c.slug + ' (báo cáo: ' + REASONS[r.reason] + ')', c.target);
      }
      closeFor(r.codeId, 'blocked', actor);
    } else if (action === 'dismiss') {
      if (r.status === 'open') { r.status = 'dismissed'; r.closedAt = now(); r.closedBy = actor ? actor.email : null; }
    } else {
      throw new HttpError(400, 'Thao tác không hợp lệ');
    }
    db.save();
  }

  return { create, list, resolve, closeFor, openCount, slugFrom, REASONS };
}

module.exports = { createReportService, REASONS };
