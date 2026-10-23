/* ManhTool — Bộ mã hóa QR Code (ISO/IEC 18004) tự viết, không cần thư viện.
   Chạy được cả trên trình duyệt (window.QRCore) lẫn Node (require) để kiểm thử.
   Hỗ trợ phiên bản 1–40, 4 mức sửa lỗi L/M/Q/H, chế độ số / chữ-số / byte (UTF-8), tự chọn mặt nạ tốt nhất. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QRCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LEVELS = ['L', 'M', 'Q', 'H'];
  const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // Số byte sửa lỗi mỗi khối và số khối, theo phiên bản (chỉ số 0 bỏ trống)
  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };

  const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  // Chế độ: mã 4 bit và số bit đếm ký tự cho nhóm phiên bản 1–9, 10–26, 27–40
  const MODES = {
    numeric: { bits: 0x1, count: [10, 12, 14] },
    alnum: { bits: 0x2, count: [9, 11, 13] },
    byte: { bits: 0x4, count: [8, 16, 16] }
  };

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(str));
    const s = unescape(encodeURIComponent(String(str)));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* ---------- Dung lượng ---------- */
  function rawModules(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const a = Math.floor(ver / 7) + 2;
      n -= (25 * a - 10) * a - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }
  function dataCodewords(ver, ecc) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * NUM_BLOCKS[ecc][ver];
  }
  function countBits(mode, ver) { return MODES[mode].count[ver <= 9 ? 0 : ver <= 26 ? 1 : 2]; }

  /* ---------- Ghi bit ---------- */
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.put = function (val, len) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  };

  // Phân đoạn dữ liệu: chọn chế độ gọn nhất cho cả chuỗi
  function makeSegment(text, bytes) {
    if (bytes) return { mode: 'byte', count: bytes.length, data: bytes };
    const s = String(text);
    if (/^[0-9]*$/.test(s) && s.length) return { mode: 'numeric', count: s.length, data: s };
    if (s.length && Array.prototype.every.call(s, (c) => ALNUM.indexOf(c) >= 0)) return { mode: 'alnum', count: s.length, data: s };
    const b = utf8(s);
    return { mode: 'byte', count: b.length, data: b };
  }

  function segmentBits(seg) {
    if (seg.mode === 'numeric') return Math.floor(seg.count / 3) * 10 + [0, 4, 7][seg.count % 3];
    if (seg.mode === 'alnum') return Math.floor(seg.count / 2) * 11 + (seg.count % 2) * 6;
    return seg.count * 8;
  }

  function writeSegment(bb, seg, ver) {
    bb.put(MODES[seg.mode].bits, 4);
    bb.put(seg.count, countBits(seg.mode, ver));
    const d = seg.data;
    if (seg.mode === 'numeric') {
      for (let i = 0; i < d.length; i += 3) {
        const chunk = d.substr(i, 3);
        bb.put(parseInt(chunk, 10), chunk.length * 3 + 1);
      }
    } else if (seg.mode === 'alnum') {
      let i = 0;
      for (; i + 1 < d.length; i += 2) bb.put(ALNUM.indexOf(d[i]) * 45 + ALNUM.indexOf(d[i + 1]), 11);
      if (i < d.length) bb.put(ALNUM.indexOf(d[i]), 6);
    } else {
      for (let i = 0; i < d.length; i++) bb.put(d[i], 8);
    }
  }

  /* ---------- Reed–Solomon trên GF(256), đa thức 0x11D ---------- */
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = gfMul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, divisor) {
    const r = new Array(divisor.length).fill(0);
    for (const b of data) {
      const f = b ^ r.shift();
      r.push(0);
      for (let i = 0; i < divisor.length; i++) r[i] ^= gfMul(divisor[i], f);
    }
    return r;
  }

  // Chia dữ liệu thành khối, thêm mã sửa lỗi rồi xen kẽ các khối
  function addEccAndInterleave(data, ver, ecc) {
    const numBlocks = NUM_BLOCKS[ecc][ver];
    const eccLen = ECC_PER_BLOCK[ecc][ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - (raw % numBlocks);
    const shortLen = Math.floor(raw / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const e = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(e));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        // Bỏ byte đệm của khối ngắn
        if (i !== shortLen - eccLen || j >= numShort) out.push(blocks[j][i]);
      }
    }
    return out;
  }

  /* ---------- Ma trận ---------- */
  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const out = [6];
    for (let pos = ver * 4 + 17 - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  function Grid(ver) {
    this.size = ver * 4 + 17;
    this.mod = new Uint8Array(this.size * this.size);
    this.fn = new Uint8Array(this.size * this.size);
  }
  Grid.prototype.setFn = function (x, y, dark) {
    const i = y * this.size + x;
    this.mod[i] = dark ? 1 : 0;
    this.fn[i] = 1;
  };

  function drawFunctionPatterns(g, ver) {
    const size = g.size;
    for (let i = 0; i < size; i++) { g.setFn(6, i, i % 2 === 0); g.setFn(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          g.setFn(x, y, d !== 2 && d !== 4);
        }
      }
    });
    const al = alignPositions(ver);
    const last = al.length - 1;
    for (let i = 0; i < al.length; i++) {
      for (let j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; // trùng ô định vị
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) g.setFn(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    drawFormat(g, 'M', 0); // giữ chỗ, vẽ lại sau khi chọn mặt nạ
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = (bits >>> i) & 1;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        g.setFn(a, b, bit);
        g.setFn(b, a, bit);
      }
    }
  }

  function drawFormat(g, ecc, mask) {
    const data = (FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => (bits >>> i) & 1;
    const size = g.size;
    for (let i = 0; i <= 5; i++) g.setFn(8, i, bit(i));
    g.setFn(8, 7, bit(6));
    g.setFn(8, 8, bit(7));
    g.setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) g.setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) g.setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) g.setFn(8, size - 15 + i, bit(i));
    g.setFn(8, size - 8, 1); // ô tối cố định
  }

  // Đặt dữ liệu theo đường zigzag từ góc dưới phải
  function drawCodewords(g, data) {
    const size = g.size;
    let i = 0;
    const total = data.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? size - 1 - vert : vert;
          const k = y * size + x;
          if (!g.fn[k] && i < total) {
            g.mod[k] = (data[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
        }
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  ];

  function applyMask(g, m) {
    const f = MASKS[m], size = g.size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const k = y * size + x;
        if (!g.fn[k] && f(x, y)) g.mod[k] ^= 1;
      }
    }
  }

  /* ---------- Điểm phạt (chọn mặt nạ) ---------- */
  const PAT_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const PAT_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  function lineScore(line) {
    let s = 0;
    // Quy tắc 1: 5 ô cùng màu liên tiếp trở lên
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += 3 + run - 5; run = 1; }
    }
    // Quy tắc 3: mẫu giống ô định vị 1:1:3:1:1 kèm 4 ô sáng (ngoài lề tính là sáng)
    const pad = [0, 0, 0, 0].concat(line, [0, 0, 0, 0]);
    for (let i = 0; i + 11 <= pad.length; i++) {
      let a = true, b = true;
      for (let k = 0; k < 11 && (a || b); k++) {
        if (pad[i + k] !== PAT_A[k]) a = false;
        if (pad[i + k] !== PAT_B[k]) b = false;
      }
      if (a) s += 40;
      if (b) s += 40;
    }
    return s;
  }

  function penalty(g) {
    const size = g.size, m = g.mod;
    let s = 0;
    for (let y = 0; y < size; y++) s += lineScore(Array.from(m.subarray(y * size, y * size + size)));
    for (let x = 0; x < size; x++) {
      const col = new Array(size);
      for (let y = 0; y < size; y++) col[y] = m[y * size + x];
      s += lineScore(col);
    }
    // Quy tắc 2: khối 2x2 cùng màu
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y * size + x];
        if (c === m[y * size + x + 1] && c === m[(y + 1) * size + x] && c === m[(y + 1) * size + x + 1]) s += 3;
      }
    }
    // Quy tắc 4: tỉ lệ ô tối lệch khỏi 50%
    let dark = 0;
    for (let i = 0; i < m.length; i++) dark += m[i];
    const total = size * size;
    s += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return s;
  }

  /* ---------- Hàm chính ---------- */
  function encode(text, opts) {
    opts = opts || {};
    let ecc = LEVELS.indexOf(opts.ecc) >= 0 ? opts.ecc : 'M';
    const minV = Math.max(1, Math.min(40, opts.minVersion | 0 || 1));
    const maxV = Math.max(minV, Math.min(40, opts.maxVersion | 0 || 40));
    const seg = makeSegment(text, opts.bytes);

    let ver = 0, used = 0;
    for (let v = minV; v <= maxV; v++) {
      const need = 4 + countBits(seg.mode, v) + segmentBits(seg);
      if (seg.count < (1 << countBits(seg.mode, v)) && need <= dataCodewords(v, ecc) * 8) { ver = v; used = need; break; }
    }
    if (!ver) {
      const e = new Error('Nội dung quá dài để tạo mã QR');
      e.code = 'too_long';
      throw e;
    }
    // Tăng mức sửa lỗi nếu vẫn vừa cùng phiên bản (miễn phí thêm độ bền)
    if (opts.boostEcc !== false) {
      for (let i = LEVELS.indexOf(ecc) + 1; i < LEVELS.length; i++) {
        if (used <= dataCodewords(ver, LEVELS[i]) * 8) ecc = LEVELS[i];
      }
    }

    const cap = dataCodewords(ver, ecc) * 8;
    const bb = new BitBuf();
    writeSegment(bb, seg, ver);
    bb.put(0, Math.min(4, cap - bb.bits.length));
    bb.put(0, (8 - (bb.bits.length % 8)) % 8);
    for (let pad = 0xec; bb.bits.length < cap; pad ^= 0xec ^ 0x11) bb.put(pad, 8);
    const bytes = [];
    for (let i = 0; i < bb.bits.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b = (b << 1) | bb.bits[i + k];
      bytes.push(b);
    }

    const g = new Grid(ver);
    drawFunctionPatterns(g, ver);
    drawCodewords(g, addEccAndInterleave(bytes, ver, ecc));

    let mask = Number.isInteger(opts.mask) && opts.mask >= 0 && opts.mask <= 7 ? opts.mask : -1;
    if (mask < 0) {
      let best = Infinity;
      for (let m = 0; m < 8; m++) {
        applyMask(g, m);
        drawFormat(g, ecc, m);
        const p = penalty(g);
        if (p < best) { best = p; mask = m; }
        applyMask(g, m); // mặt nạ là XOR: áp lại để gỡ
      }
    }
    applyMask(g, mask);
    drawFormat(g, ecc, mask);

    const size = g.size;
    return {
      version: ver, size, ecc, mask, matrix: g.mod,
      get(x, y) { return x >= 0 && y >= 0 && x < size && y < size ? g.mod[y * size + x] === 1 : false; },
      isFunction(x, y) { return x >= 0 && y >= 0 && x < size && y < size ? g.fn[y * size + x] === 1 : false; },
      // Ô định vị (mắt) 7x7: 0 trên trái, 1 trên phải, 2 dưới trái
      finderAt(x, y) {
        if (y >= 0 && y < 7) { if (x >= 0 && x < 7) return 0; if (x >= size - 7 && x < size) return 1; }
        if (x >= 0 && x < 7 && y >= size - 7 && y < size) return 2;
        return -1;
      }
    };
  }

  // Số byte tối đa ở phiên bản 40 (chế độ byte)
  function maxBytes(ecc) {
    ecc = LEVELS.indexOf(ecc) >= 0 ? ecc : 'M';
    return Math.floor((dataCodewords(40, ecc) * 8 - 4 - 16) / 8);
  }

  return { encode, utf8, maxBytes, LEVELS };
});
