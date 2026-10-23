/* Mã QR động: mã in ra chỉ chứa đường dẫn ngắn SHORT_URL/q/<slug>, đích đến lưu trên máy chủ nên sửa lúc nào cũng được.
   Mỗi lần quét được ghi vào thống kê gộp của mã (theo ngày, giờ, hệ điều hành, trình duyệt, quốc gia)
   — không lưu IP, chỉ lưu bản băm trong ngày để đếm người quét không trùng. */
'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('../lib/http');

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // bỏ i, l, o, 0, 1 dễ nhầm
const SLUG_LEN = 6;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;
const RESERVED = new Set(['api', 'admin', 'assets', 'login', 'logout', 'static', 'manhtool', 'www', 'help', 'pro']);
const MAX_URL = 2000;
const MAX_DESIGN = 64 * 1024;   // thiết kế (màu, kiểu chấm, logo nén nhỏ)
const HISTORY = 20;             // giữ 20 lần đổi đích gần nhất
const RECENT = 30;              // 30 lượt quét gần nhất
const KEEP_DAYS = 400;          // thống kê theo ngày giữ hơn 1 năm
const FREE_STATS_DAYS = 30;     // tài khoản miễn phí xem 30 ngày gần nhất
const GRACE_MS = 3 * 86400000;  // hết Pro: mã vượt hạn mức vẫn chạy thêm 3 ngày
const MAX_SEEN = 200000;
const TZ_MS = 7 * 3600000;      // thống kê theo giờ Việt Nam

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|skype|preview|curl|wget|python|httpclient|headless|okhttp|go-http|axios|node-fetch|lighthouse|monitor/i;

const dayKey = (t) => new Date(t + TZ_MS).toISOString().slice(0, 10);
const hourOf = (t) => new Date(t + TZ_MS).getUTCHours();

// Đọc hệ điều hành, trình duyệt, loại máy từ User-Agent (đủ cho thống kê, không cần thư viện)
function parseUA(ua) {
  ua = String(ua || '');
  let os = 'Khác', dev = 'desktop', br = 'Khác';
  if (/iPad/.test(ua)) { os = 'iOS'; dev = 'tablet'; }
  else if (/iPhone|iPod/.test(ua)) { os = 'iOS'; dev = 'mobile'; }
  else if (/Android/.test(ua)) { os = 'Android'; dev = /Mobile/.test(ua) ? 'mobile' : 'tablet'; }
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  if (/Zalo/i.test(ua)) br = 'Zalo';
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) br = 'Facebook';
  else if (/Instagram/.test(ua)) br = 'Instagram';
  else if (/coc_coc|CocCoc/i.test(ua)) br = 'Cốc Cốc';
  else if (/Edg\//.test(ua)) br = 'Edge';
  else if (/SamsungBrowser/.test(ua)) br = 'Samsung Internet';
  else if (/Firefox|FxiOS/.test(ua)) br = 'Firefox';
  else if (/OPR\/|Opera/.test(ua)) br = 'Opera';
  else if (/CriOS|Chrome/.test(ua)) br = 'Chrome';
  else if (/Safari/.test(ua)) br = 'Safari';
  return { os, br, dev };
}

const isBot = (ua) => !ua || BOT_RE.test(ua);

function emptyStats() {
  return { total: 0, unique: 0, last: null, days: {}, os: {}, br: {}, dev: {}, cc: {}, hours: new Array(24).fill(0), recent: [] };
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + salt.toString('base64url') + '$' + crypto.scryptSync(pw, salt, 32).toString('base64url');
}

function checkPassword(pw, stored) {
  const parts = String(stored || '').split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 3) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(parts[1], 'base64url'), 32);
  const b = Buffer.from(parts[2], 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createCodeService({ config, db, users, now }) {
  const codes = () => db.data.codes;
  const shortHost = new URL(config.shortUrl).host;
  const publicHost = new URL(config.publicUrl).host;

  // slug → id, dựng 1 lần khi khởi động để tra cứu nhanh mỗi lượt quét
  const slugIndex = new Map();
  Object.values(codes()).forEach((c) => {
    if (!c.stats) c.stats = emptyStats();
    slugIndex.set(c.slug, c.id);
  });

  function bySlug(slug) {
    const id = slugIndex.get(String(slug || '').toLowerCase());
    return id ? codes()[id] : null;
  }

  function newSlug() {
    for (;;) {
      const bytes = crypto.randomBytes(SLUG_LEN);
      let s = '';
      for (let i = 0; i < SLUG_LEN; i++) s += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
      if (!slugIndex.has(s)) return s;
    }
  }

  function shortLink(c) { return config.shortUrl + '/q/' + c.slug; }

  /* ---------- Làm sạch dữ liệu nhập ---------- */
  // Đích đến chỉ nhận http/https; tự thêm https:// nếu người dùng gõ "example.com"
  function cleanUrl(v, label, required) {
    let s = String(v == null ? '' : v).trim();
    if (!s) {
      if (required) throw new HttpError(400, 'Vui lòng nhập ' + label);
      return '';
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { throw new HttpError(400, label.charAt(0).toUpperCase() + label.slice(1) + ' không hợp lệ'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, label.charAt(0).toUpperCase() + label.slice(1) + ' phải bắt đầu bằng http:// hoặc https://');
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') throw new HttpError(400, label.charAt(0).toUpperCase() + label.slice(1) + ' thiếu tên miền');
    if ((u.host === shortHost || u.host === publicHost) && u.pathname.startsWith('/q/')) throw new HttpError(400, 'Không thể trỏ một mã QR động sang mã QR động khác');
    if (u.href.length > MAX_URL) throw new HttpError(400, 'Đường dẫn quá dài (tối đa ' + MAX_URL + ' ký tự)');
    return u.href;
  }

  const cleanText = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

  function cleanDesign(d) {
    if (d == null) return null;
    if (typeof d !== 'object' || Array.isArray(d)) throw new HttpError(400, 'Thiết kế không hợp lệ');
    if (Buffer.byteLength(JSON.stringify(d)) > MAX_DESIGN) throw new HttpError(413, 'Thiết kế quá lớn (logo nên nhỏ hơn 40KB)');
    return d;
  }

  /* ---------- Trạng thái & hạn mức ---------- */
  // Hạn mức dùng khi phục vụ lượt quét: hết Pro vẫn được thêm vài ngày trước khi tạm dừng mã vượt mức
  function serveLimit(u) {
    return users.limitFor(users.isPro(u) || (!!u.proUntil && now() < u.proUntil + GRACE_MS));
  }

  // Mã đang bật của 1 người, cũ nhất trước (mã cũ được ưu tiên giữ chạy khi vượt hạn mức)
  function enabledOf(userId) {
    return Object.values(codes()).filter((c) => c.userId === userId && c.active && !c.blocked)
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  }

  // Thứ hạng (0 = cũ nhất) của mọi mã đang bật, tính 1 lần cho cả danh sách thay vì lọc lại kho mã cho từng mã
  function ranks() {
    const byUser = new Map();
    Object.values(codes()).forEach((c) => {
      if (!c.active || c.blocked) return;
      if (!byUser.has(c.userId)) byUser.set(c.userId, []);
      byUser.get(c.userId).push(c);
    });
    const out = new Map();
    byUser.forEach((list) => {
      list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)).forEach((c, i) => out.set(c.id, i));
    });
    return out;
  }

  // active | off (chủ tắt) | blocked (quản trị khóa) | expired | limit (đủ lượt quét) | quota (vượt hạn mức gói)
  function state(c, rankMap) {
    if (c.blocked) return 'blocked';
    if (!c.active) return 'off';
    if (c.expiresAt && c.expiresAt <= now()) return 'expired';
    if (c.scanLimit && c.stats.total >= c.scanLimit) return 'limit';
    const owner = db.data.users[c.userId];
    if (!owner || !owner.active) return 'off';
    const rank = rankMap ? rankMap.get(c.id) : enabledOf(c.userId).findIndex((x) => x.id === c.id);
    if (rank >= serveLimit(owner)) return 'quota';
    return 'active';
  }

  function spark(c, days) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = c.stats.days[dayKey(now() - i * 86400000)];
      out.push(d ? d[0] : 0);
    }
    return out;
  }

  function toPublic(c, full, rankMap) {
    const out = {
      id: c.id, slug: c.slug, shortUrl: shortLink(c), name: c.name, folder: c.folder || '',
      target: c.target, iosUrl: c.iosUrl || '', androidUrl: c.androidUrl || '',
      active: !!c.active, blocked: !!c.blocked, state: state(c, rankMap),
      expiresAt: c.expiresAt || null, scanLimit: c.scanLimit || 0, hasPassword: !!c.pw,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
      total: c.stats.total, unique: c.stats.unique, last: c.stats.last, spark: spark(c, 14)
    };
    if (full) {
      out.design = c.design || null;
      out.history = (c.history || []).slice();
    }
    return out;
  }

  function listOf(user) {
    return Object.values(codes()).filter((c) => c.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  }

  function quota(user) {
    return { used: enabledOf(user.id).length, limit: users.codeLimit(user), total: listOf(user).length, pro: users.isPro(user), proUntil: user.proUntil || null };
  }

  function needPro(user) {
    if (!users.isPro(user)) throw new HttpError(403, 'Tính năng này cần gói Pro');
  }

  // Áp các trường người dùng gửi lên (dùng cho cả tạo mới và sửa)
  function apply(c, body, user, isNew) {
    if (body.name !== undefined || isNew) c.name = cleanText(body.name, 80) || 'Mã QR ' + c.slug;
    if (body.folder !== undefined) c.folder = cleanText(body.folder, 40);
    if (body.target !== undefined || isNew) {
      const t = cleanUrl(body.target, 'đường dẫn đích', true);
      if (!isNew && t !== c.target) {
        c.history = [{ at: now(), target: c.target }].concat(c.history || []).slice(0, HISTORY);
      }
      c.target = t;
    }
    if (body.iosUrl !== undefined) c.iosUrl = cleanUrl(body.iosUrl, 'đường dẫn cho iPhone', false);
    if (body.androidUrl !== undefined) c.androidUrl = cleanUrl(body.androidUrl, 'đường dẫn cho Android', false);
    if (body.design !== undefined) c.design = cleanDesign(body.design);

    // Tính năng Pro: đặt tên đường dẫn, hẹn ngày tắt, giới hạn lượt quét, mật khẩu. Tắt đi thì luôn được.
    if (body.slug !== undefined && String(body.slug).trim().toLowerCase() !== c.slug) {
      needPro(user);
      const s = String(body.slug).trim().toLowerCase();
      if (!SLUG_RE.test(s) || /--/.test(s)) throw new HttpError(400, 'Đường dẫn chỉ gồm chữ thường không dấu, số, dấu gạch ngang (3–32 ký tự)');
      if (RESERVED.has(s)) throw new HttpError(400, 'Đường dẫn này đã được dành riêng, hãy chọn tên khác');
      if (slugIndex.has(s)) throw new HttpError(409, 'Đường dẫn này đã có người dùng');
      if (!isNew) slugIndex.delete(c.slug);
      c.slug = s;
      slugIndex.set(s, c.id);
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null || body.expiresAt === '') c.expiresAt = null;
      else {
        needPro(user);
        const t = typeof body.expiresAt === 'number' ? body.expiresAt : Date.parse(body.expiresAt);
        if (!Number.isFinite(t)) throw new HttpError(400, 'Ngày hết hạn không hợp lệ');
        c.expiresAt = t;
      }
    }
    if (body.scanLimit !== undefined) {
      const n = Math.floor(Number(body.scanLimit) || 0);
      if (n < 0 || n > 1e9) throw new HttpError(400, 'Giới hạn lượt quét không hợp lệ');
      if (n) needPro(user);
      c.scanLimit = n;
    }
    if (body.password !== undefined) {
      if (body.password === null || body.password === '') c.pw = null;
      else {
        needPro(user);
        const pw = String(body.password);
        if (pw.length < 4 || pw.length > 64) throw new HttpError(400, 'Mật khẩu dài 4–64 ký tự');
        c.pw = hashPassword(pw);
      }
    }
  }

  function create(user, body) {
    const q = quota(user);
    if (q.used >= q.limit) {
      throw new HttpError(403, q.pro
        ? 'Bạn đã dùng hết ' + q.limit + ' mã động. Hãy tắt bớt mã không dùng.'
        : q.limit ? 'Tài khoản miễn phí dùng được ' + q.limit + ' mã động. Nâng cấp Pro để tạo thêm, hoặc tắt bớt mã cũ.' : 'Mã QR động cần gói Pro');
    }
    const c = {
      id: crypto.randomUUID(), slug: newSlug(), userId: user.id, name: '', folder: '', target: '', iosUrl: '', androidUrl: '',
      active: true, blocked: false, expiresAt: null, scanLimit: 0, pw: null, design: null, history: [],
      createdAt: now(), updatedAt: now(), stats: emptyStats()
    };
    apply(c, body, user, true);
    codes()[c.id] = c;
    slugIndex.set(c.slug, c.id);
    db.save();
    return c;
  }

  function update(user, c, body) {
    // Bật lại mã đang tắt phải còn hạn mức
    if (body.active === true && !c.active) {
      const q = quota(user);
      if (q.used >= q.limit) throw new HttpError(403, 'Đã đủ ' + q.limit + ' mã đang bật. Tắt bớt mã khác' + (q.pro ? '' : ' hoặc nâng cấp Pro') + ' rồi thử lại.');
      c.active = true;
    } else if (body.active === false) c.active = false;
    apply(c, body, user, false);
    c.updatedAt = now();
    db.save();
    return c;
  }

  function remove(c) {
    slugIndex.delete(c.slug);
    delete codes()[c.id];
    db.save();
  }

  function removeAllOf(userId) {
    Object.values(codes()).forEach((c) => { if (c.userId === userId) { slugIndex.delete(c.slug); delete codes()[c.id]; } });
  }

  /* ---------- Lượt quét ---------- */
  function record(c, req, ip, country) {
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    if (isBot(ua)) return false;
    const t = now();
    const day = dayKey(t);
    const st = c.stats;
    const info = parseUA(ua);

    const seen = db.data.seen;
    if (seen.day !== day) { seen.day = day; seen.keys = {}; }
    const key = crypto.createHash('sha256').update(db.data.secret + '|' + c.id + '|' + ip + '|' + ua).digest('base64url').slice(0, 16);
    const unique = !seen.keys[key];
    if (unique && Object.keys(seen.keys).length < MAX_SEEN) seen.keys[key] = 1;

    st.total++;
    if (unique) st.unique++;
    st.last = t;
    if (!st.days[day]) {
      st.days[day] = [0, 0];
      // Ngày mới: bỏ dữ liệu quá cũ
      const cut = dayKey(t - KEEP_DAYS * 86400000);
      Object.keys(st.days).forEach((k) => { if (k < cut) delete st.days[k]; });
    }
    st.days[day][0]++;
    if (unique) st.days[day][1]++;
    st.os[info.os] = (st.os[info.os] || 0) + 1;
    st.br[info.br] = (st.br[info.br] || 0) + 1;
    st.dev[info.dev] = (st.dev[info.dev] || 0) + 1;
    if (country) st.cc[country] = (st.cc[country] || 0) + 1;
    st.hours[hourOf(t)]++;
    st.recent.unshift({ at: t, os: info.os, br: info.br, dev: info.dev, cc: country || '' });
    st.recent.length = Math.min(st.recent.length, RECENT);
    db.saveSoon();
    return true;
  }

  // Chọn đích theo thiết bị: iPhone/iPad → iosUrl, Android → androidUrl, còn lại → target
  function destination(c, ua) {
    const os = parseUA(ua).os;
    if (os === 'iOS' && c.iosUrl) return c.iosUrl;
    if (os === 'Android' && c.androidUrl) return c.androidUrl;
    return c.target;
  }

  /* ---------- Báo cáo ---------- */
  function stats(user, c, days) {
    const max = users.isPro(user) ? KEEP_DAYS : FREE_STATS_DAYS;
    days = Math.max(1, Math.min(max, Math.floor(Number(days) || 30)));
    const st = c.stats;
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = dayKey(now() - i * 86400000);
      const d = st.days[date] || [0, 0];
      series.push({ date, n: d[0], u: d[1] });
    }
    const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v }));
    return {
      days, maxDays: max, total: st.total, unique: st.unique, last: st.last,
      inRange: series.reduce((s, d) => s + d.n, 0), series,
      os: sorted(st.os), br: sorted(st.br), dev: sorted(st.dev), cc: sorted(st.cc),
      hours: st.hours.slice(), recent: st.recent.slice()
    };
  }

  // CSV theo ngày (UTF-8 có BOM để Excel đọc đúng tiếng Việt)
  function csv(c) {
    const rows = [['Ngày', 'Lượt quét', 'Người quét (không trùng trong ngày)']];
    Object.keys(c.stats.days).sort().forEach((d) => rows.push([d, c.stats.days[d][0], c.stats.days[d][1]]));
    return '﻿' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
  }

  // Cookie mở khóa mã có mật khẩu: HMAC theo mã + mật khẩu hiện tại (đổi mật khẩu → cookie cũ hết tác dụng)
  function unlockToken(c) {
    return crypto.createHmac('sha256', db.data.secret).update(c.id + '|' + c.pw).digest('base64url').slice(0, 32);
  }

  return {
    bySlug, toPublic, ranks, listOf, quota, create, update, remove, removeAllOf, state, record, destination, stats, csv,
    checkPassword, unlockToken, shortLink, parseUA, isBot
  };
}

module.exports = { createCodeService, parseUA, isBot, dayKey, hashPassword, checkPassword };
