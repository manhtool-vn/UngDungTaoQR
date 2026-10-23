/* Kiểm thử bộ mã hóa QR: tạo mã → vẽ ra ảnh → giải lại bằng jsQR, so từng byte. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jsQR = require('jsqr');
const QR = require(path.join(__dirname, '..', 'public', 'assets', 'js', 'qr-core.js'));

// Vẽ ma trận ra ảnh RGBA với vùng trắng 4 ô quanh mã
function render(qr, px) {
  px = px || 4;
  const quiet = 4;
  const dim = (qr.size + quiet * 2) * px;
  const img = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.get(x, y)) continue;
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const i = (((y + quiet) * px + dy) * dim + (x + quiet) * px + dx) * 4;
          img[i] = img[i + 1] = img[i + 2] = 0;
        }
      }
    }
  }
  return { img, dim };
}

function roundTrip(text, opts, px) {
  const qr = QR.encode(text, opts);
  const { img, dim } = render(qr, px);
  const out = jsQR(img, dim, dim, { inversionAttempts: 'dontInvert' });
  assert.ok(out, 'jsQR không đọc được mã (v' + qr.version + ' ' + qr.ecc + ' mask ' + qr.mask + ')');
  assert.deepEqual(Array.from(out.binaryData), Array.from(QR.utf8(text)));
  return { qr, out };
}

test('mã mẫu: HELLO WORLD mức M là phiên bản 1 (21x21), chế độ chữ-số', () => {
  const qr = QR.encode('HELLO WORLD', { ecc: 'M', boostEcc: false });
  assert.equal(qr.version, 1);
  assert.equal(qr.size, 21);
  assert.equal(qr.matrix.length, 441);
  assert.equal(qr.ecc, 'M');
  // Tăng mức sửa lỗi: vẫn vừa phiên bản 1 ở mức Q
  assert.equal(QR.encode('HELLO WORLD', { ecc: 'M' }).ecc, 'Q');
  roundTrip('HELLO WORLD', { ecc: 'M' });
});

test('đọc lại đúng nhiều kiểu nội dung', () => {
  const samples = [
    'https://manhtool.id.vn',
    'https://manhtool.id.vn/q/AbC123?utm_source=qr',
    'Xin chào Việt Nam! Những công cụ nhỏ – Tạo nên giá trị lớn. Đặng Thị Ngọc Ánh ữừựỹ',
    '0123456789012345678901234567890',
    '7',
    'HELLO WORLD $%*+-./: 123',
    'WIFI:T:WPA;S:Nhà Mạnh 5G;P:matkhau\\;123;H:false;;',
    'BEGIN:VCARD\nVERSION:3.0\nFN:Nguyễn Văn A\nTEL:+84988392321\nEND:VCARD',
    '😀 emoji 𝔘𝔫𝔦𝔠𝔬𝔡𝔢'
  ];
  for (const s of samples) roundTrip(s);
});

test('chọn chế độ gọn nhất: số < chữ-số < byte', () => {
  const n = QR.encode('1'.repeat(40), { ecc: 'L', boostEcc: false });
  const b = QR.encode('a'.repeat(40), { ecc: 'L', boostEcc: false });
  assert.ok(n.version < b.version);
  roundTrip('1'.repeat(40), { ecc: 'L' });
});

test('mọi mức sửa lỗi đọc lại được và đúng mức đã chọn', () => {
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    const { qr } = roundTrip('https://manhtool.id.vn/cong-cu/tao-ma-qr', { ecc, boostEcc: false });
    assert.equal(qr.ecc, ecc);
  }
});

test('ép từng mặt nạ 0..7 vẫn đọc lại được', () => {
  for (let mask = 0; mask < 8; mask++) {
    const { qr } = roundTrip('Mặt nạ số ' + mask + ' - kiểm tra', { mask });
    assert.equal(qr.mask, mask);
  }
});

test('nhiều phiên bản: nhỏ đến lớn, có thông tin phiên bản (>= 7)', () => {
  const seen = new Set();
  for (const len of [10, 50, 100, 200, 400, 700, 1000, 1400]) {
    let s = '';
    for (let i = 0; s.length < len; i++) s += 'Đoạn ' + i + ' abc xyz; ';
    s = s.slice(0, len);
    const { qr } = roundTrip(s, { ecc: 'M' }, 3);
    seen.add(qr.version);
  }
  assert.ok([...seen].some((v) => v >= 7), 'phải có phiên bản >= 7');
  assert.ok([...seen].some((v) => v >= 25), 'phải có phiên bản lớn');
});

test('đủ 40 phiên bản x 4 mức sửa lỗi', () => {
  for (let v = 1; v <= 40; v++) {
    for (const ecc of ['L', 'M', 'Q', 'H']) {
      // jsQR 1.4.0 ghi sai tâm ô căn chỉnh phiên bản 23 (74 thay vì 78 theo ISO 18004),
      // mức L ít mã sửa lỗi nhất nên không bù được → bỏ qua riêng ô này
      if (v === 23 && ecc === 'L') continue;
      const { qr } = roundTrip('v' + v, { ecc, minVersion: v, boostEcc: false }, 2);
      assert.equal(qr.version, v);
      assert.equal(qr.ecc, ecc);
    }
  }
});

test('minVersion ép kích thước tối thiểu', () => {
  const { qr } = roundTrip('abc', { minVersion: 10 });
  assert.equal(qr.version, 10);
  assert.equal(qr.size, 57);
});

test('sát dung lượng phiên bản 40', () => {
  for (const ecc of ['L', 'H']) {
    const max = QR.maxBytes(ecc);
    const s = 'x'.repeat(max).replace(/x/g, (c, i) => String.fromCharCode(97 + (i % 26)));
    const { qr } = roundTrip(s, { ecc, boostEcc: false }, 2);
    assert.equal(qr.version, 40);
    assert.equal(qr.size, 177);
  }
  assert.equal(QR.maxBytes('L'), 2953);
  assert.equal(QR.maxBytes('M'), 2331);
  assert.equal(QR.maxBytes('Q'), 1663);
  assert.equal(QR.maxBytes('H'), 1273);
});

test('nội dung quá dài báo lỗi too_long', () => {
  assert.throws(() => QR.encode('a'.repeat(QR.maxBytes('L') + 1), { ecc: 'L' }), (e) => e.code === 'too_long' && /quá dài/.test(e.message));
  assert.throws(() => QR.encode('a'.repeat(200), { maxVersion: 3 }), (e) => e.code === 'too_long');
});

test('opts.bytes: mã hóa byte thô', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 65]);
  const qr = QR.encode('', { bytes });
  const { img, dim } = render(qr);
  const out = jsQR(img, dim, dim);
  assert.deepEqual(Array.from(out.binaryData), Array.from(bytes));
});

test('isFunction và finderAt đánh dấu đúng vùng', () => {
  const qr = QR.encode('https://manhtool.id.vn', { minVersion: 7 });
  const s = qr.size;
  assert.equal(qr.finderAt(0, 0), 0);
  assert.equal(qr.finderAt(6, 6), 0);
  assert.equal(qr.finderAt(7, 7), -1);
  assert.equal(qr.finderAt(s - 1, 0), 1);
  assert.equal(qr.finderAt(s - 7, 6), 1);
  assert.equal(qr.finderAt(0, s - 1), 2);
  assert.equal(qr.finderAt(s - 1, s - 1), -1);
  // Ô định vị: viền tối, vòng sáng, lõi 3x3 tối
  assert.equal(qr.get(0, 0), true);
  assert.equal(qr.get(1, 1), false);
  assert.equal(qr.get(3, 3), true);
  assert.equal(qr.get(7, 7), false); // vạch phân cách
  assert.ok(qr.isFunction(6, 10)); // đường thời gian
  assert.ok(qr.isFunction(8, s - 8)); // ô tối cố định
  assert.ok(qr.get(8, s - 8));
  assert.ok(qr.isFunction(s - 11, 0)); // thông tin phiên bản
  assert.ok(!qr.isFunction(s - 1, s - 1)); // ô dữ liệu
  assert.equal(qr.get(-1, 0), false);
});

test('utf8 mã hóa đúng tiếng Việt', () => {
  assert.deepEqual(Array.from(QR.utf8('Việt')), [0x56, 0x69, 0xe1, 0xbb, 0x87, 0x74]);
});
