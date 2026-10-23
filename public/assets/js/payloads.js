/* ManhTool — Tạo nội dung chuẩn cho từng loại mã QR: đường dẫn, Wi-Fi, danh thiếp (vCard), chuyển khoản VietQR (chuẩn NAPAS/EMVCo)…
   Không đụng DOM: chạy được cả trên trình duyệt (window.QRPayloads) lẫn Node để kiểm thử. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QRPayloads = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ngân hàng Việt Nam: mã BIN (NAPAS) + tên ngắn. Sắp theo mức độ phổ biến.
  var BANKS = [
    ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'],
    ['970407', 'Techcombank'], ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'],
    ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970437', 'HDBank'], ['970441', 'VIB'],
    ['970443', 'SHB'], ['970431', 'Eximbank'], ['970426', 'MSB'], ['970440', 'SeABank'],
    ['970448', 'OCB'], ['970449', 'LPBank'], ['970428', 'Nam A Bank'], ['970409', 'Bac A Bank'],
    ['970425', 'ABBANK'], ['970433', 'Vietbank'], ['970454', 'BVBank'], ['970412', 'PVcomBank'],
    ['970400', 'Saigonbank'], ['970429', 'SCB'], ['970419', 'NCB'], ['970452', 'KienlongBank'],
    ['970438', 'BaoViet Bank'], ['970430', 'PGBank'], ['970427', 'VietABank'], ['970406', 'Vikki Bank (DongA)'],
    ['970408', 'GPBank'], ['970414', 'MBV (OceanBank)'], ['970424', 'Shinhan Bank'], ['970457', 'Woori Bank'],
    ['970458', 'UOB'], ['970410', 'Standard Chartered'], ['970439', 'Public Bank'], ['970442', 'Hong Leong'],
    ['422589', 'CIMB'], ['970421', 'VRB'], ['970434', 'Indovina'], ['970446', 'Co-op Bank'],
    ['546034', 'Cake by VPBank'], ['546035', 'Ubank by VPBank'], ['963388', 'Timo']
  ].map(function (b) { return { bin: b[0], name: b[1] }; });

  var str = function (v) { return v == null ? '' : String(v); };

  // Bỏ dấu tiếng Việt (nội dung chuyển khoản nhiều ngân hàng không nhận chữ có dấu)
  function plain(s) {
    return str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  /* ---------- Đường dẫn ---------- */
  function url(v) {
    var s = str(v).trim();
    if (!s) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s;
    return 'https://' + s;
  }

  function isUrl(v) {
    try { var u = new URL(url(v)); return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.indexOf('.') > 0; } catch (e) { return false; }
  }

  /* ---------- Wi-Fi: WIFI:T:WPA;S:tên;P:mật khẩu;H:true;; ---------- */
  var wifiEsc = function (s) { return str(s).replace(/([\\;,:"])/g, '\\$1'); };
  function wifi(o) {
    o = o || {};
    var auth = o.auth === 'nopass' || o.auth === 'WEP' || o.auth === 'SAE' ? o.auth : 'WPA';
    if (!str(o.ssid)) return '';
    var s = 'WIFI:T:' + auth + ';S:' + wifiEsc(o.ssid) + ';';
    if (auth !== 'nopass') s += 'P:' + wifiEsc(o.password) + ';';
    if (o.hidden) s += 'H:true;';
    return s + ';';
  }

  /* ---------- Điện thoại, SMS, email, Zalo ---------- */
  var cleanPhone = function (s) { return str(s).replace(/[^\d+]/g, ''); };
  function phone(v) { var p = cleanPhone(v); return p ? 'tel:' + p : ''; }
  function sms(o) {
    o = o || {};
    var p = cleanPhone(o.phone);
    if (!p) return '';
    return 'SMSTO:' + p + ':' + str(o.body);
  }
  function email(o) {
    o = o || {};
    var to = str(o.to).trim();
    if (!to) return '';
    var q = [];
    if (o.subject) q.push('subject=' + encodeURIComponent(o.subject));
    if (o.body) q.push('body=' + encodeURIComponent(o.body));
    return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
  }
  function zalo(v) {
    var p = cleanPhone(v).replace(/^\+84/, '0');
    return p ? 'https://zalo.me/' + p : '';
  }

  /* ---------- Danh thiếp vCard 3.0 ---------- */
  var vEsc = function (s) { return str(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1'); };
  function vcard(o) {
    o = o || {};
    var last = str(o.lastName).trim(), first = str(o.firstName).trim();
    if (!last && !first && !str(o.org).trim()) return '';
    var full = [last, first].filter(Boolean).join(' ') || str(o.org).trim();
    var lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vEsc(last) + ';' + vEsc(first) + ';;;', 'FN:' + vEsc(full)];
    if (o.org) lines.push('ORG:' + vEsc(o.org));
    if (o.title) lines.push('TITLE:' + vEsc(o.title));
    if (o.mobile) lines.push('TEL;TYPE=CELL:' + cleanPhone(o.mobile));
    if (o.work) lines.push('TEL;TYPE=WORK:' + cleanPhone(o.work));
    if (o.email) lines.push('EMAIL:' + str(o.email).trim());
    if (o.website) lines.push('URL:' + url(o.website));
    if (o.address) lines.push('ADR;TYPE=WORK:;;' + vEsc(o.address) + ';;;;');
    if (o.note) lines.push('NOTE:' + vEsc(o.note));
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  /* ---------- Sự kiện (iCalendar) ---------- */
  function icsTime(v) {
    var d = new Date(v);
    if (isNaN(d)) return '';
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function event(o) {
    o = o || {};
    var title = str(o.title).trim();
    var start = icsTime(o.start);
    if (!title || !start) return '';
    var end = icsTime(o.end) || icsTime(new Date(new Date(o.start).getTime() + 3600000));
    var lines = ['BEGIN:VEVENT', 'SUMMARY:' + vEsc(title), 'DTSTART:' + start, 'DTEND:' + end];
    if (o.location) lines.push('LOCATION:' + vEsc(o.location));
    if (o.desc) lines.push('DESCRIPTION:' + vEsc(o.desc));
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  }

  /* ---------- Vị trí: mở Google Maps (dùng được trên cả iPhone lẫn Android) ---------- */
  function geo(o) {
    o = o || {};
    var lat = parseFloat(o.lat), lng = parseFloat(o.lng);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return 'https://maps.google.com/?q=' + lat + ',' + lng;
    }
    var q = str(o.query).trim();
    return q ? 'https://maps.google.com/?q=' + encodeURIComponent(q) : '';
  }

  /* ---------- VietQR (chuẩn EMVCo của NAPAS) ----------
     Mỗi trường: mã 2 số + độ dài 2 số + giá trị. Kết thúc bằng 6304 + CRC-16/CCITT-FALSE. */
  function tlv(id, value) {
    value = str(value);
    var len = value.length;
    return id + (len < 10 ? '0' : '') + len + value;
  }

  function crc16(s) {
    var crc = 0xffff;
    for (var i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return ('000' + crc.toString(16).toUpperCase()).slice(-4);
  }

  // Nội dung chuyển khoản: bỏ dấu, viết hoa, chỉ giữ chữ, số, khoảng trắng và . - /
  // → cả chuỗi VietQR thuộc bộ ký tự chữ-số của QR nên mã nhỏ hơn 1–2 phiên bản, thưa chấm, dễ quét
  // (ngân hàng vốn hiện nội dung chuyển khoản in hoa)
  function cleanInfo(s) { return plain(s).toUpperCase().replace(/[^A-Z0-9 .\-/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50); }

  function vietqr(o) {
    o = o || {};
    var bin = str(o.bin).trim(), acc = str(o.account).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(bin) || !/^[A-Za-z0-9]{3,19}$/.test(acc)) return '';
    var amount = Math.floor(Number(str(o.amount).replace(/[^\d]/g, '')) || 0);
    var info = cleanInfo(o.info);
    var merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acc)) + tlv('02', 'QRIBFTTA');
    var s = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704');
    if (amount) s += tlv('54', String(amount));
    s += tlv('58', 'VN');
    if (info) s += tlv('62', tlv('08', info));
    s += '6304';
    return s + crc16(s);
  }

  // Đọc ngược mã VietQR (dùng khi quét ảnh để hiện thông tin dễ hiểu)
  function parseTlv(s) {
    var out = {}, i = 0;
    while (i + 4 <= s.length) {
      var id = s.substr(i, 2), len = parseInt(s.substr(i + 2, 2), 10);
      if (!isFinite(len)) return null;
      out[id] = s.substr(i + 4, len);
      i += 4 + len;
    }
    return i === s.length ? out : null;
  }
  function readVietqr(s) {
    s = str(s);
    if (!/^000201/.test(s) || s.length < 30) return null;
    if (crc16(s.slice(0, -4)) !== s.slice(-4).toUpperCase()) return null;
    var top = parseTlv(s);
    if (!top || !top['38']) return null;
    var m = parseTlv(top['38']), acct = m && m['01'] && parseTlv(m['01']);
    if (!acct) return null;
    var bank = BANKS.filter(function (b) { return b.bin === acct['00']; })[0];
    var extra = top['62'] ? parseTlv(top['62']) : null;
    return { bin: acct['00'], bank: bank ? bank.name : '', account: acct['01'] || '', amount: top['54'] ? Number(top['54']) : 0, info: extra && extra['08'] || '' };
  }

  /* ---------- Bảng loại mã: ô cần nhập + cách ghép nội dung ---------- */
  function build(type, v) {
    v = v || {};
    switch (type) {
      case 'url': return url(v.url);
      case 'text': return str(v.text);
      case 'wifi': return wifi(v);
      case 'phone': return phone(v.phone);
      case 'sms': return sms(v);
      case 'email': return email(v);
      case 'vcard': return vcard(v);
      case 'bank': return vietqr(v);
      case 'zalo': return zalo(v.phone);
      case 'geo': return geo(v);
      case 'event': return event(v);
      default: return '';
    }
  }

  return {
    BANKS: BANKS, build: build, url: url, isUrl: isUrl, wifi: wifi, phone: phone, sms: sms, email: email, zalo: zalo,
    vcard: vcard, event: event, geo: geo, vietqr: vietqr, readVietqr: readVietqr, crc16: crc16, plain: plain, cleanInfo: cleanInfo
  };
});
