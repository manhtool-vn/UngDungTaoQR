'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../public/assets/js/payloads.js');
const R = require('../public/assets/js/qr-render.js');
const Z = require('../public/assets/js/zip.js');
const QR = require('../public/assets/js/qr-core.js');

test('CRC-16/CCITT-FALSE đúng giá trị kiểm chuẩn', () => {
  assert.equal(P.crc16('123456789'), '29B1');
});

test('VietQR: cấu trúc EMVCo + CRC, đọc ngược được', () => {
  const s = P.vietqr({ bin: '970407', account: '19036 1234 567', amount: '50.000', info: 'Ủng hộ ManhTool #1' });
  assert.match(s, /^000201010212/); // có số tiền → mã động (12)
  assert.ok(s.includes('0010A000000727'));
  assert.ok(s.includes('0208QRIBFTTA'));
  assert.ok(s.includes('5303704'));
  assert.ok(s.includes('540550000'));
  assert.ok(s.includes('5802VN'));
  assert.equal(P.crc16(s.slice(0, -4)), s.slice(-4));
  const back = P.readVietqr(s);
  assert.deepEqual(back, { bin: '970407', bank: 'Techcombank', account: '190361234567', amount: 50000, info: 'UNG HO MANHTOOL 1' });
  // Cả chuỗi thuộc bộ ký tự chữ-số của QR → mã gọn hơn chế độ byte
  assert.match(s, /^[0-9A-Z $%*+\-./:]+$/);
  assert.ok(QR.encode(s, { ecc: 'M' }).version < QR.encode(s, { ecc: 'M', bytes: QR.utf8(s) }).version);
  // Không số tiền → mã tĩnh (11)
  assert.match(P.vietqr({ bin: '970422', account: '0988392321' }), /^000201010211/);
  // Thiếu ngân hàng / tài khoản → rỗng
  assert.equal(P.vietqr({ bin: '', account: '123' }), '');
  // Sửa 1 ký tự → CRC sai → không đọc
  assert.equal(P.readVietqr(s.slice(0, 20) + 'X' + s.slice(21)), null);
});

test('Wi-Fi: thoát ký tự đặc biệt, mạng ẩn, không mật khẩu', () => {
  assert.equal(P.wifi({ ssid: 'Nha;Toi', password: 'a:b\\c', auth: 'WPA', hidden: true }), 'WIFI:T:WPA;S:Nha\\;Toi;P:a\\:b\\\\c;H:true;;');
  assert.equal(P.wifi({ ssid: 'Cafe', auth: 'nopass' }), 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(P.wifi({ ssid: '' }), '');
});

test('Đường dẫn, điện thoại, SMS, email, Zalo, vị trí', () => {
  assert.equal(P.url('manhtool.id.vn'), 'https://manhtool.id.vn');
  assert.equal(P.url('http://a.vn'), 'http://a.vn');
  assert.ok(P.isUrl('manhtool.id.vn/abc'));
  assert.ok(!P.isUrl('xin chao'));
  assert.equal(P.phone('0988 392 321'), 'tel:0988392321');
  assert.equal(P.sms({ phone: '0988.392.321', body: 'Chào' }), 'SMSTO:0988392321:Chào');
  assert.equal(P.email({ to: 'a@b.vn', subject: 'Hỏi giá', body: 'x&y' }), 'mailto:a@b.vn?subject=H%E1%BB%8Fi%20gi%C3%A1&body=x%26y');
  assert.equal(P.zalo('+84988392321'), 'https://zalo.me/0988392321');
  assert.equal(P.geo({ lat: '21.0285', lng: '105.8542' }), 'https://maps.google.com/?q=21.0285,105.8542');
  assert.equal(P.geo({ query: 'Hồ Gươm' }), 'https://maps.google.com/?q=H%E1%BB%93%20G%C6%B0%C6%A1m');
});

test('vCard 3.0 và sự kiện iCalendar', () => {
  const v = P.vcard({ lastName: 'Nguyễn', firstName: 'Mạnh', org: 'ManhTool; JSC', mobile: '0988 392 321', email: 'a@b.vn', website: 'manhtool.id.vn' });
  assert.ok(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Nguyễn;Mạnh;;;\r\nFN:Nguyễn Mạnh'));
  assert.ok(v.includes('ORG:ManhTool\\; JSC'));
  assert.ok(v.includes('TEL;TYPE=CELL:0988392321'));
  assert.ok(v.includes('URL:https://manhtool.id.vn'));
  assert.ok(v.endsWith('END:VCARD'));
  const e = P.event({ title: 'Họp', start: '2026-10-21T09:00:00Z', location: 'Hà Nội' });
  assert.ok(e.includes('DTSTART:20261021T090000Z'));
  assert.ok(e.includes('DTEND:20261021T100000Z'));
});

test('Vẽ SVG: mọi kiểu chấm / mắt / khung đều ra SVG hợp lệ', () => {
  const qr = QR.encode('https://manhtool.id.vn', { ecc: 'H' });
  R.DOTS.forEach((dot) => R.FRAMES.forEach((eyeFrame) => R.BALLS.forEach((eyeBall) => {
    const out = R.svg(qr, { dot, eyeFrame, eyeBall }, { size: 300 });
    assert.match(out.svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+">/);
    assert.ok(!/NaN|undefined/.test(out.svg), dot + '/' + eyeFrame + '/' + eyeBall);
  })));
  R.LABELS.forEach((label) => {
    const out = R.svg(qr, { label, labelText: 'Quét <mã> & nhận quà', grad: 'linear', logo: 'data:image/png;base64,iVBORw0KGgo=' }, { size: 400 });
    assert.ok(!/NaN|undefined/.test(out.svg));
    assert.ok(!out.svg.includes('<mã>'), 'chữ trong khung phải được thoát ký tự');
    if (label !== 'none') assert.ok(out.height > out.width);
  });
});

test('Vẽ SVG: mã hình tròn / trái tim, khung thiệp, hộp quà, vé mời, polaroid', () => {
  const qr = QR.encode('https://manhtool.id.vn/menu', { ecc: 'M' });
  R.SHAPES.forEach((shape) => R.LABELS.forEach((label) => {
    const out = R.svg(qr, { shape, label, labelText: '', dot: 'heart', grad: 'radial' }, { size: 300 });
    assert.ok(!/NaN|undefined|Infinity/.test(out.svg), shape + '/' + label);
    // Thẻ nào lặp thuộc tính thì cả ảnh SVG không mở được
    out.svg.match(/<[a-z][^>]*>/gi).forEach((tag) => {
      const names = [...tag.matchAll(/\s([\w:-]+)=/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, tag.slice(0, 60));
    });
  }));
  // Thiệp, hộp quà, vé, polaroid để trống chữ vẫn có khung; dải chữ để trống thì bỏ khung
  assert.ok(R.svg(qr, { label: 'card', labelText: '' }).height > R.svg(qr, {}).height);
  assert.equal(R.svg(qr, { label: 'bottom', labelText: ' ' }).height, R.svg(qr, {}).height);

  // Hình tròn / trái tim: khối mã cùng lề sáng nằm trọn trong hình, phần còn lại có chấm trang trí mờ
  for (const n of [21, 29, 57, 101]) {
    for (const shape of ['circle', 'heart']) {
      const L = R.shapeLayout(shape, n, 2);
      for (let i = 0; i < L.box; i++) {
        for (const [x, y] of [[L.bx + i, L.by], [L.bx + i, L.by + L.box - 1], [L.bx, L.by + i], [L.bx + L.box - 1, L.by + i]]) {
          assert.ok(R.inShape(shape, x, y, L.G), shape + ' ' + n + ': ô (' + x + ', ' + y + ') ra ngoài hình');
        }
      }
    }
  }
  const heart = R.svg(qr, { shape: 'heart', dot: 'star' }).svg;
  assert.ok(heart.includes('fill-opacity=".3"'));
  assert.equal(R.svg(qr, { shape: 'heart', dot: 'star' }).svg, heart, 'cùng mã thì cùng kiểu rải chấm trang trí');

  // Nhiều ảnh trên cùng trang (ảnh thu nhỏ các mẫu): mỗi ảnh một mã dải màu riêng
  const a = R.svg(qr, { grad: 'linear' }).svg, b = R.svg(qr, { grad: 'radial' }).svg;
  const ia = a.match(/id="(qg\d+)"/)[1], ib = b.match(/id="(qg\d+)"/)[1];
  assert.notEqual(ia, ib);
  assert.ok(a.includes('url(#' + ia + ')'));
});

test('Thiết kế: làm sạch dữ liệu lạ, cảnh báo màu khó quét', () => {
  const d = R.normalize({ fg: 'red', dot: 'x', margin: 99, logo: 'javascript:alert(1)', logoSize: 5 });
  assert.equal(d.fg, R.DEFAULT.fg);
  assert.equal(d.dot, 'square');
  assert.equal(d.margin, 10);
  assert.equal(d.logo, '');
  assert.equal(d.logoSize, 0.3);
  assert.equal(R.warnings({ fg: '#eeeeee', bg: '#ffffff' }).length, 1);
  assert.equal(R.warnings({ fg: '#000000', bg: '#ffffff' }).length, 0);
  assert.ok(Math.abs(R.contrast('#000000', '#ffffff') - 21) < 0.01);
  assert.equal(R.normalize({ shape: 'tam-giac' }).shape, 'square');
  // Chấm hình vui + kiểu mắt đọc trượt (theo ma trận thử quét) → có cảnh báo
  assert.ok(R.riskyEyes({ dot: 'heart', eyeFrame: 'dots' }));
  assert.ok(R.riskyEyes({ dot: 'small', eyeFrame: 'dots' }));
  assert.ok(R.riskyEyes({ dot: 'star', eyeFrame: 'square', eyeBall: 'flower' }));
  assert.ok(!R.riskyEyes({ dot: 'star', eyeFrame: 'rounded', eyeBall: 'flower' }));
  assert.ok(!R.riskyEyes({ dot: 'square', eyeFrame: 'dots' }));
  assert.equal(R.warnings({ dot: 'sparkle', eyeFrame: 'dots' }).length, 1);
});

test('ZIP: cấu trúc đúng, CRC32 chuẩn, tên tiếng Việt', () => {
  assert.equal(Z.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const out = Z.zip([{ name: 'mã-1.svg', data: '<svg/>' }, { name: 'b.png', data: new Uint8Array([1, 2, 3]) }]);
  const dv = new DataView(out.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(out.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(out.length - 22 + 10, true), 2);
});

test('Vị trí ô căn chỉnh khớp với bộ mã hóa ở mọi phiên bản', () => {
  for (let v = 1; v <= 40; v++) {
    const qr = QR.encode('A', { minVersion: v, maxVersion: v, ecc: 'L' });
    const cs = R.alignCenters(v);
    if (v === 1) { assert.equal(cs.length, 0); continue; }
    cs.forEach(([x, y]) => {
      assert.ok(qr.get(x, y) && qr.isFunction(x, y), 'tâm tối, v' + v);
      assert.ok(!qr.get(x + 1, y) && !qr.get(x, y - 1), 'vòng sáng, v' + v);
      assert.ok(qr.get(x + 2, y) && qr.get(x - 2, y + 2), 'viền tối, v' + v);
    });
  }
});
