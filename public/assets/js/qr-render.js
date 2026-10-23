/* ManhTool — Vẽ mã QR thành SVG theo thiết kế: kiểu chấm, kiểu mắt định vị, màu / dải màu, logo, khung có chữ.
   Chỉ tạo chuỗi SVG (không đụng DOM) nên chạy được cả trên trình duyệt (window.QRRender) lẫn Node để kiểm thử.
   Mỗi ô (module) rộng 10 đơn vị; mọi chấm gộp vào 1 path để ảnh PNG không bị vệt mảnh giữa các ô. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QRRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var U = 10;
  var DOTS = ['square', 'rounded', 'dots', 'classy', 'diamond', 'small', 'vbars', 'hbars', 'heart', 'star', 'flower', 'sparkle'];
  // Không có khung mắt / lõi mắt hình kim cương, trái tim, ngôi sao: thử quét (jsQR) cho thấy máy đọc tính sai tâm mắt
  // định vị vì các hình này lệch tâm hoặc tràn vào vòng sáng quanh lõi. Bông hoa đối xứng nên vẫn quét tốt.
  var FRAMES = ['square', 'rounded', 'circle', 'leaf', 'dots'];
  var BALLS = ['square', 'rounded', 'circle', 'leaf', 'flower'];
  var LABELS = ['none', 'bottom', 'top', 'pill', 'bubble', 'card', 'gift', 'ticket', 'polaroid'];
  // Hình dáng cả mã: mã vẫn là khối vuông ở giữa, phần còn lại của hình rải chấm nhạt trang trí
  var SHAPES = ['square', 'circle', 'heart'];
  var FONT = 'Arial, Helvetica, sans-serif';
  var SERIF = 'Georgia, "Times New Roman", serif';
  var HAND = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';

  var DEFAULT = {
    fg: '#0f2620', bg: '#ffffff', transparent: false,
    grad: 'none', fg2: '#12b886', angle: 135, shape: 'square',
    dot: 'square', eyeFrame: 'square', eyeBall: 'square', eyeColor: '', eyeBallColor: '',
    margin: 4, ecc: 'M',
    logo: '', logoSize: 0.22, logoPlate: 'square',
    label: 'none', labelText: 'QUÉT MÃ', labelColor: '#0f2620', labelTextColor: '#ffffff'
  };

  var HEX = /^#[0-9a-f]{6}$/i;
  var pick = function (v, list, def) { return list.indexOf(v) >= 0 ? v : def; };
  var color = function (v, def) { return HEX.test(v) ? v.toLowerCase() : def; };
  var clamp = function (v, lo, hi, def) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  // Trộn màu hex với đen / trắng (t = 0..1), dùng cho bóng đổ, nơ hộp quà
  var mix = function (hex, to, t) {
    var a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), out = '#';
    for (var i = 16; i >= 0; i -= 8) out += ('0' + Math.round(((a >> i) & 255) * (1 - t) + ((b >> i) & 255) * t).toString(16)).slice(-2);
    return out;
  };
  // Mỗi ảnh một mã dải màu riêng: nhiều SVG nằm chung một trang mà trùng id thì ảnh sau mượn nhầm dải màu của ảnh trước
  var uid = 0;

  // Làm sạch thiết kế (dữ liệu có thể đến từ máy chủ hay localStorage)
  function normalize(d) {
    d = d || {};
    var D = DEFAULT;
    return {
      fg: color(d.fg, D.fg), bg: color(d.bg, D.bg), transparent: !!d.transparent,
      grad: pick(d.grad, ['none', 'linear', 'radial'], D.grad), fg2: color(d.fg2, D.fg2), angle: clamp(d.angle, 0, 360, D.angle), shape: pick(d.shape, SHAPES, D.shape),
      dot: pick(d.dot, DOTS, D.dot), eyeFrame: pick(d.eyeFrame, FRAMES, D.eyeFrame), eyeBall: pick(d.eyeBall, BALLS, D.eyeBall),
      eyeColor: color(d.eyeColor, ''), eyeBallColor: color(d.eyeBallColor, ''),
      margin: Math.round(clamp(d.margin, 0, 10, D.margin)), ecc: pick(d.ecc, ['L', 'M', 'Q', 'H'], D.ecc),
      logo: typeof d.logo === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,[A-Za-z0-9+/=]+$/.test(d.logo) ? d.logo : '',
      logoSize: clamp(d.logoSize, 0.1, 0.3, D.logoSize), logoPlate: pick(d.logoPlate, ['none', 'square', 'circle'], D.logoPlate),
      label: pick(d.label, LABELS, D.label), labelText: String(d.labelText == null ? D.labelText : d.labelText).slice(0, 40),
      labelColor: color(d.labelColor, D.labelColor), labelTextColor: color(d.labelTextColor, D.labelTextColor)
    };
  }

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- Hình cơ bản (trả về chuỗi lệnh path) ---------- */
  // Hình chữ nhật bo từng góc: r = [trên-trái, trên-phải, dưới-phải, dưới-trái]
  function rrect(x, y, w, h, r) {
    var a = r[0], b = r[1], c = r[2], d = r[3];
    return 'M' + r2(x) + ' ' + r2(y + a) +
      (a ? 'A' + r2(a) + ' ' + r2(a) + ' 0 0 1 ' + r2(x + a) + ' ' + r2(y) : '') +
      'L' + r2(x + w - b) + ' ' + r2(y) +
      (b ? 'A' + r2(b) + ' ' + r2(b) + ' 0 0 1 ' + r2(x + w) + ' ' + r2(y + b) : '') +
      'L' + r2(x + w) + ' ' + r2(y + h - c) +
      (c ? 'A' + r2(c) + ' ' + r2(c) + ' 0 0 1 ' + r2(x + w - c) + ' ' + r2(y + h) : '') +
      'L' + r2(x + d) + ' ' + r2(y + h) +
      (d ? 'A' + r2(d) + ' ' + r2(d) + ' 0 0 1 ' + r2(x) + ' ' + r2(y + h - d) : '') + 'Z';
  }
  function circle(cx, cy, r) {
    return 'M' + r2(cx - r) + ' ' + r2(cy) + 'a' + r2(r) + ' ' + r2(r) + ' 0 1 0 ' + r2(2 * r) + ' 0a' + r2(r) + ' ' + r2(r) + ' 0 1 0 ' + r2(-2 * r) + ' 0Z';
  }
  function diamond(cx, cy, h) {
    return 'M' + r2(cx) + ' ' + r2(cy - h) + 'L' + r2(cx + h) + ' ' + r2(cy) + 'L' + r2(cx) + ' ' + r2(cy + h) + 'L' + r2(cx - h) + ' ' + r2(cy) + 'Z';
  }
  // Trái tim tâm (cx, cy), rộng w (cao ~0.86w), đáy nhọn hướng xuống
  function heart(cx, cy, w) {
    var k = w / 2;
    var P = function (x, y) { return r2(cx + x * k) + ' ' + r2(cy + (y + 0.035) * k); };
    return 'M' + P(0, 0.82) + 'C' + P(-0.27, 0.57) + ' ' + P(-1, 0.11) + ' ' + P(-1, -0.3) +
      'C' + P(-1, -0.68) + ' ' + P(-0.75, -0.89) + ' ' + P(-0.48, -0.89) + 'C' + P(-0.23, -0.89) + ' ' + P(-0.07, -0.75) + ' ' + P(0, -0.55) +
      'C' + P(0.07, -0.75) + ' ' + P(0.23, -0.89) + ' ' + P(0.48, -0.89) + 'C' + P(0.75, -0.89) + ' ' + P(1, -0.68) + ' ' + P(1, -0.3) +
      'C' + P(1, 0.11) + ' ' + P(0.27, 0.57) + ' ' + P(0, 0.82) + 'Z';
  }
  // Ngôi sao 5 cánh: R bán kính đỉnh, ri bán kính chân cánh (ri lớn → sao "mũm mĩm", dễ quét hơn)
  function star(cx, cy, R, ri) {
    var p = '';
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : R;
      p += (i ? 'L' : 'M') + r2(cx + Math.cos(a) * r) + ' ' + r2(cy + Math.sin(a) * r);
    }
    return p + 'Z';
  }
  // Bông hoa 5 cánh tròn quanh nhụy, rộng w
  function flower(cx, cy, w) {
    var p = circle(cx, cy, w * 0.2);
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      p += circle(cx + Math.cos(a) * w * 0.26, cy + Math.sin(a) * w * 0.26, w * 0.24);
    }
    return p;
  }
  // Ánh lấp lánh 4 cánh cong (✦), R bán kính đỉnh
  function sparkle(cx, cy, R) {
    var c = R * 0.2;
    var P = function (x, y) { return r2(cx + x) + ' ' + r2(cy + y); };
    return 'M' + P(0, -R) + 'Q' + P(c, -c) + ' ' + P(R, 0) + 'Q' + P(c, c) + ' ' + P(0, R) + 'Q' + P(-c, c) + ' ' + P(-R, 0) + 'Q' + P(-c, -c) + ' ' + P(0, -R) + 'Z';
  }

  /* ---------- Chấm dữ liệu ---------- */
  function dotPath(style, x, y, n) {
    var cx = x + U / 2, cy = y + U / 2, R = U / 2;
    switch (style) {
      case 'dots': return circle(cx, cy, U * 0.48);
      case 'small': return rrect(x + 0.9, y + 0.9, 8.2, 8.2, [0, 0, 0, 0]);
      case 'diamond': return diamond(cx, cy, U * 0.56);
      case 'heart': return heart(cx, cy, U * 1.1);
      case 'star': return star(cx, cy, U * 0.62, U * 0.32);
      case 'flower': return flower(cx, cy, U * 1.06);
      case 'sparkle': return sparkle(cx, cy, U * 0.64);
      case 'rounded': return rrect(x, y, U, U, [!n.t && !n.l ? R : 0, !n.t && !n.r ? R : 0, !n.b && !n.r ? R : 0, !n.b && !n.l ? R : 0]);
      case 'classy': return rrect(x, y, U, U, [!n.t && !n.l ? R : 0, 0, !n.b && !n.r ? R : 0, 0]);
      case 'vbars': return rrect(x + 1, y, 8, U, [n.t ? 0 : 4, n.t ? 0 : 4, n.b ? 0 : 4, n.b ? 0 : 4]);
      case 'hbars': return rrect(x, y + 1, U, 8, [n.l ? 0 : 4, n.r ? 0 : 4, n.r ? 0 : 4, n.l ? 0 : 4]);
      default: return 'M' + x + ' ' + y + 'h' + U + 'v' + U + 'h-' + U + 'Z';
    }
  }

  // Chấm trang trí rải trong hình tròn / trái tim (không mang dữ liệu): nhỏ hơn chấm thật một chút
  function decoPath(style, x, y) {
    var cx = x + U / 2, cy = y + U / 2;
    switch (style) {
      case 'heart': return heart(cx, cy, U * 0.9);
      case 'star': return star(cx, cy, U * 0.5, U * 0.26);
      case 'flower': return flower(cx, cy, U * 0.86);
      case 'sparkle': return sparkle(cx, cy, U * 0.52);
      case 'diamond': return diamond(cx, cy, U * 0.42);
      case 'small': case 'square': return rrect(x + 1.5, y + 1.5, 7, 7, [1.5, 1.5, 1.5, 1.5]);
      default: return circle(cx, cy, U * 0.36);
    }
  }

  /* ---------- Mắt định vị (3 ô vuông lớn ở góc) ---------- */
  // Bo kiểu "lá": góc ngoài cùng và góc đối diện, xoay theo vị trí mắt
  function leafCorners(i, r) { return i === 0 ? [r, 0, r, 0] : [0, r, 0, r]; }

  function eyeFramePath(style, x, y, i) {
    var S = 7 * U, I = 5 * U;
    switch (style) {
      case 'rounded': return rrect(x, y, S, S, [20, 20, 20, 20]) + rrect(x + U, y + U, I, I, [12, 12, 12, 12]);
      case 'circle': return circle(x + S / 2, y + S / 2, S / 2) + circle(x + S / 2, y + S / 2, S / 2 - U);
      case 'leaf': return rrect(x, y, S, S, leafCorners(i, 28)) + rrect(x + U, y + U, I, I, leafCorners(i, 20));
      case 'dots': {
        // Khung ghép từ 24 chấm tròn chồng nhẹ lên nhau: nhìn như chuỗi hạt nhưng vẫn liền mạch để máy quét nhận ra
        var p = '';
        for (var k = 0; k < 7; k++) {
          for (var j = 0; j < 7; j++) {
            if (k === 0 || k === 6 || j === 0 || j === 6) p += circle(x + k * U + U / 2, y + j * U + U / 2, U * 0.6);
          }
        }
        return p;
      }
      default: return rrect(x, y, S, S, [0, 0, 0, 0]) + rrect(x + U, y + U, I, I, [0, 0, 0, 0]);
    }
  }

  function eyeBallPath(style, x, y, i, frame) {
    var bx = x + 2 * U, by = y + 2 * U, S = 3 * U;
    switch (style) {
      case 'rounded': return rrect(bx, by, S, S, [8, 8, 8, 8]);
      // Lõi tròn hơi lớn hơn 3 ô: bớt khoảng trắng ở góc khi đặt trong khung vuông, máy quét bắt mắt dễ hơn
      case 'circle': return circle(bx + S / 2, by + S / 2, S * 0.55);
      case 'leaf': return rrect(bx, by, S, S, leafCorners(i, 13));
      // Lõi bông hoa vẽ to hơn khối 3×3 một chút để phần tối đủ đầy như lõi vuông
      case 'flower': return flower(bx + S / 2, by + S / 2, S * 1.2);
      // Trong khung tròn, góc lõi vuông bo nhẹ để khe sáng theo đường chéo không quá hẹp
      default: return rrect(bx, by, S, S, frame === 'circle' ? [6, 6, 6, 6] : [0, 0, 0, 0]);
    }
  }

  /* ---------- Ô căn chỉnh (ô vuông nhỏ 5×5 trong mã từ phiên bản 2) ----------
     Luôn vẽ liền khối theo kiểu mắt: vẽ bằng chấm rời thì máy quét dễ không tìm ra khi ảnh lớn, nét. */
  function alignCenters(ver) {
    if (ver < 2) return [];
    var num = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
    var pos = [6];
    for (var p = ver * 4 + 10; pos.length < num; p -= step) pos.splice(1, 0, p);
    var last = pos[pos.length - 1], out = [];
    pos.forEach(function (cy) {
      pos.forEach(function (cx) {
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === last) || (cx === last && cy === 6)) return;
        out.push([cx, cy]);
      });
    });
    return out;
  }

  function alignPath(frame, ball, x, y) {
    var S = 5 * U, cx = x + S / 2, cy = y + S / 2, ring, dot;
    if (frame === 'circle') ring = circle(cx, cy, S / 2) + circle(cx, cy, S / 2 - U);
    else if (frame === 'square') ring = rrect(x, y, S, S, [0, 0, 0, 0]) + rrect(x + U, y + U, 3 * U, 3 * U, [0, 0, 0, 0]);
    else ring = rrect(x, y, S, S, [14, 14, 14, 14]) + rrect(x + U, y + U, 3 * U, 3 * U, [8, 8, 8, 8]);
    if (ball !== 'square') dot = circle(cx, cy, U / 2 + 0.4);
    else dot = rrect(cx - U / 2, cy - U / 2, U, U, [0, 0, 0, 0]);
    return { ring: ring, dot: dot };
  }

  /* ---------- Hình dáng cả mã: tròn, trái tim ----------
     Lưới G×G ô bao quanh; khối mã (kèm lề sáng `gap` ô) đặt sao cho nằm trọn trong hình, phần trống còn lại
     rải chấm nhạt trang trí. Lề sáng ≥ 2 ô giữ cho máy quét vẫn tách được mã khỏi phần trang trí. */
  var heartF = function (u, v) { var a = u * u + v * v - 1; return a * a * a - u * u * v * v * v; };
  // Ô (x, y) của lưới G có nằm trong hình không (co vào 6% để chấm trang trí không chạm mép nền)
  function inShape(shape, x, y, G) {
    if (shape === 'heart') return heartF((-1.25 + 2.5 * (x + 0.5) / G) * 1.06, (1.32 - 2.5 * (y + 0.5) / G) * 1.06) <= 0;
    var r = G / 2, dx = x + 0.5 - r, dy = y + 0.5 - r;
    return dx * dx + dy * dy <= (r - 0.3) * (r - 0.3);
  }
  var layouts = {};
  function shapeLayout(shape, N, gap) {
    var key = shape + N + '-' + gap;
    if (layouts[key]) return layouts[key];
    var box = N + 2 * gap, out = null;
    for (var G = box + 2; G < box * 3 && !out; G++) {
      var bx = Math.round((G - box) / 2);
      for (var by = 0; by + box <= G && !out; by++) {
        var ok = true;
        for (var i = 0; i < box && ok; i++) {
          ok = inShape(shape, bx + i, by, G) && inShape(shape, bx + i, by + box - 1, G) && inShape(shape, bx, by + i, G) && inShape(shape, bx + box - 1, by + i, G);
        }
        if (ok) out = { G: G, bx: bx, by: by, box: box, ox: bx + gap, oy: by + gap };
      }
    }
    return (layouts[key] = out);
  }
  // Viền nền trái tim (cùng phương trình với lưới), dò bán kính theo từng góc; P = lề quanh lưới
  function heartOutline(G, P, grow) {
    var pts = [];
    for (var i = 0; i < 144; i++) {
      var t = i / 144 * Math.PI * 2, lo = 0, hi = 2;
      for (var k = 0; k < 24; k++) { var mid = (lo + hi) / 2; if (heartF(mid * Math.cos(t), mid * Math.sin(t)) <= 0) lo = mid; else hi = mid; }
      var u = lo * Math.cos(t) * grow, v = lo * Math.sin(t) * grow;
      pts.push(r2(P + (u / 1.06 + 1.25) * G / 2.5 * U) + ' ' + r2(P + (1.32 - v / 1.06) * G / 2.5 * U));
    }
    return 'M' + pts.join('L') + 'Z';
  }
  // Số ngẫu nhiên có hạt giống: cùng một mã luôn ra cùng một kiểu rải chấm trang trí
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Độ tương phản (cảnh báo màu khó quét) ---------- */
  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /* ---------- Ghép SVG ---------- */
  // qr: kết quả QRCore.encode; d: thiết kế; opts.size: chiều rộng ảnh (px)
  function svg(qr, design, opts) {
    var d = normalize(design);
    opts = opts || {};
    var N = qr.size, M = d.margin;
    // Khối mã: vuông = mã + lề trắng; tròn / trái tim = cả hình bao quanh mã (lề sáng trong hình 2–4 ô)
    var lay = d.shape !== 'square' ? shapeLayout(d.shape, N, Math.max(2, Math.min(4, M))) : null;
    var P = lay ? U : 0;
    var Q = lay ? lay.G * U + 2 * P : (N + 2 * M) * U;
    // Góc trên-trái vùng dữ liệu trong khối mã
    var offX = lay ? P + lay.ox * U : M * U, offY = lay ? P + lay.oy * U : M * U;

    // Vùng logo (đo theo cạnh mã, không tính lề) + các ô bị khoét để logo nổi rõ
    var logo = null;
    if (d.logo) {
      var ls = Math.round(N * d.logoSize) * U;
      logo = { x: offX + (N * U - ls) / 2, y: offY + (N * U - ls) / 2, s: ls, pad: d.logoPlate === 'none' ? 0 : U * 0.6 };
    }
    function underLogo(x, y) {
      if (!logo) return false;
      var px = offX + x * U, py = offY + y * U, p = logo.pad + (d.logoPlate === 'none' ? 0 : U * 0.2);
      return px + U > logo.x - p && px < logo.x + logo.s + p && py + U > logo.y - p && py < logo.y + logo.s + p;
    }
    // Ô căn chỉnh vẽ riêng (liền khối); ô nào bị logo che thì để như chấm thường
    var inAlign = {}, aligns = '', alignDots = '';
    alignCenters(qr.version).forEach(function (c) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) if (underLogo(c[0] + dx, c[1] + dy)) return;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) inAlign[(c[1] + ay) * N + c[0] + ax] = 1;
      var a = alignPath(d.eyeFrame, d.eyeBall, offX + (c[0] - 2) * U, offY + (c[1] - 2) * U);
      aligns += a.ring;
      alignDots += a.dot;
    });
    var dark = function (x, y) { return x >= 0 && y >= 0 && x < N && y < N && qr.get(x, y) && qr.finderAt(x, y) < 0 && !inAlign[y * N + x] && !underLogo(x, y); };

    var dots = '';
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (!dark(x, y)) continue;
        dots += dotPath(d.dot, offX + x * U, offY + y * U, { t: dark(x, y - 1), r: dark(x + 1, y), b: dark(x, y + 1), l: dark(x - 1, y) });
      }
    }

    // Chấm trang trí phủ phần trống của hình tròn / trái tim, rải theo hạt giống lấy từ chính mã
    var decos = '';
    if (lay) {
      var seed = N;
      for (var i = 0; i < N * N; i++) if (qr.get(i % N, Math.floor(i / N))) seed = (Math.imul(seed, 31) + i) | 0;
      var rand = seeded(seed);
      for (var gy = 0; gy < lay.G; gy++) {
        for (var gx = 0; gx < lay.G; gx++) {
          if (gx >= lay.bx && gx < lay.bx + lay.box && gy >= lay.by && gy < lay.by + lay.box) continue;
          if (!inShape(d.shape, gx, gy, lay.G) || rand() > 0.5) continue;
          decos += decoPath(d.dot, P + gx * U, P + gy * U);
        }
      }
    }

    var corners = [[0, 0], [N - 7, 0], [0, N - 7]];
    var frames = '', balls = '';
    corners.forEach(function (c, i) {
      frames += eyeFramePath(d.eyeFrame, offX + c[0] * U, offY + c[1] * U, i);
      balls += eyeBallPath(d.eyeBall, offX + c[0] * U, offY + c[1] * U, i, d.eyeFrame);
    });

    // Khung quanh khối mã: dải chữ, nhãn, thiệp, hộp quà, vé mời, ảnh polaroid
    var B = Q * 0.04, band = Q * 0.2, gap = Q * 0.05;
    var W = Q, H = Q, qx = 0, qy = 0, deco = '';
    var text = esc(d.labelText.trim());
    var label = d.label;
    // Dải chữ và nhãn cần có chữ mới có nghĩa; thiệp, hộp quà, vé, polaroid để trống chữ vẫn đẹp
    if (!text && ['bottom', 'top', 'pill', 'bubble'].indexOf(label) >= 0) label = 'none';
    function textAt(cx, cy, h, w, o) {
      o = o || {};
      var fs = Math.min(h * (o.fill || 0.46), (w * 0.86) / Math.max(4, d.labelText.trim().length * (o.wide || 0.62)));
      return '<text x="' + r2(cx) + '" y="' + r2(cy) + '" fill="' + d.labelTextColor + '" font-family="' + esc(o.family || FONT) + '" font-weight="' + (o.weight || 700) + '"' +
        (o.italic ? ' font-style="italic"' : '') + ' font-size="' + r2(fs) + '" letter-spacing="' + r2(fs * (o.spacing == null ? 0.06 : o.spacing)) +
        '" text-anchor="middle" dominant-baseline="central">' + text + '</text>';
    }
    function paint(color, path, extra) { return '<path fill="' + color + '"' + (extra || '') + ' d="' + path + '"/>'; }
    function line(path, width, extra, cap) {
      return '<path fill="none" stroke="' + d.labelTextColor + '" stroke-width="' + r2(width) + '" stroke-linecap="' + (cap || 'round') + '"' + (extra || '') + ' d="' + path + '"/>';
    }

    if (label === 'bottom' || label === 'top') {
      W = Q + 2 * B; H = Q + B + band + B * 0.2; qx = B; qy = label === 'top' ? band + B * 0.2 : B;
      deco = paint(d.labelColor, rrect(0, 0, W, H, [B * 2, B * 2, B * 2, B * 2])) +
        textAt(W / 2, label === 'top' ? (band + B * 0.2) / 2 + B * 0.1 : Q + B + (band + B * 0.2) / 2 - B * 0.1, band, W);
    } else if (label === 'pill' || label === 'bubble') {
      var ph = band * 0.85, tip = label === 'bubble' ? Q * 0.05 : 0;
      W = Q; H = Q + gap + tip + ph; qx = 0; qy = 0;
      var py = Q + gap + tip;
      deco = paint(d.labelColor, rrect(Q * 0.08, py, Q * 0.84, ph, [ph / 2, ph / 2, ph / 2, ph / 2]) +
        (tip ? 'M' + r2(Q / 2 - tip) + ' ' + r2(py + 1) + 'L' + r2(Q / 2) + ' ' + r2(py - tip) + 'L' + r2(Q / 2 + tip) + ' ' + r2(py + 1) + 'Z' : '')) +
        textAt(Q / 2, py + ph / 2, ph, Q * 0.84);
    } else if (label === 'card') {
      // Thiệp: nền màu khung, viền chấm bên trong, tiêu đề chữ nghiêng có tim hai bên, hoa văn "✦ — ♥ — ✦" dưới đáy
      var cp = Q * 0.1, th = text ? Q * 0.26 : Q * 0.12, fb = Q * 0.17, ins = Q * 0.035, sw = Q * 0.008;
      W = Q + 2 * cp; H = th + Q + fb; qx = cp; qy = th;
      var mid = W / 2, ty = th / 2 + ins / 2, fy = H - fb / 2 - Q * 0.01, cr = Q * 0.045;
      deco = paint(d.labelColor, rrect(0, 0, W, H, [Q * 0.07, Q * 0.07, Q * 0.07, Q * 0.07])) +
        line(rrect(ins, ins, W - 2 * ins, H - 2 * ins, [cr, cr, cr, cr]), sw, ' stroke-opacity=".5" stroke-dasharray="0 ' + r2(sw * 2.4) + '"') +
        line('M' + r2(mid - Q * 0.22) + ' ' + r2(fy) + 'H' + r2(mid - Q * 0.075) + 'M' + r2(mid + Q * 0.075) + ' ' + r2(fy) + 'H' + r2(mid + Q * 0.22), sw * 1.2, ' stroke-opacity=".7"') +
        paint(d.labelTextColor, heart(mid, fy, Q * 0.075) + sparkle(mid - Q * 0.27, fy, Q * 0.028) + sparkle(mid + Q * 0.27, fy, Q * 0.028) +
          (text ? heart(Q * 0.13, ty, Q * 0.05) + heart(W - Q * 0.13, ty, Q * 0.05) : '')) +
        (text ? textAt(mid, ty, th, W - Q * 0.38, { family: SERIF, italic: true, fill: 0.5, wide: 0.5, spacing: 0.01 }) : '');
    } else if (label === 'gift') {
      // Hộp quà: nơ trên nắp, nắp rộng hơn thân hộp, chữ ở dải dưới thân
      var bow = Q * 0.17, lid = Q * 0.12, ov = Q * 0.035, gp = Q * 0.055, tb = text ? band : gp, rib = Q * 0.11;
      W = Q + 2 * (gp + ov); qx = ov + gp; qy = bow + lid + gp; H = qy + Q + tb;
      var gx0 = W / 2, top = bow + lid;
      var loop = function (s) {
        var X = function (v) { return r2(gx0 + s * v * Q); }, Y = function (v) { return r2(bow + v * Q); };
        return 'M' + X(0) + ' ' + Y(0) + 'C' + X(0.04) + ' ' + Y(-0.17) + ' ' + X(0.25) + ' ' + Y(-0.17) + ' ' + X(0.21) + ' ' + Y(-0.03) +
          'C' + X(0.18) + ' ' + Y(0.03) + ' ' + X(0.07) + ' ' + Y(0.015) + ' ' + X(0) + ' ' + Y(0) + 'Z';
      };
      var bowLine = ' stroke="' + mix(d.labelColor, '#000000', 0.15) + '" stroke-width="' + r2(Q * 0.01) + '" stroke-linejoin="round"';
      deco = paint(d.labelColor, rrect(ov, top - B, W - 2 * ov, H - top + B, [0, 0, B * 1.5, B * 1.5])) +
        paint(d.labelColor, rrect(0, bow, W, lid, [B, B, B * 0.6, B * 0.6])) +
        paint('#000000', 'M' + r2(ov) + ' ' + r2(top) + 'h' + r2(W - 2 * ov) + 'v' + r2(Q * 0.014) + 'h' + r2(2 * ov - W) + 'Z', ' fill-opacity=".14"') +
        paint(d.labelTextColor, rrect(gx0 - rib / 2, bow, rib, lid, [0, 0, 0, 0])) +
        // Nơ cùng màu dải ruy băng, viền màu hộp đậm hơn để vẫn nổi khi in trên giấy trắng
        paint(d.labelTextColor, loop(-1) + loop(1), bowLine) +
        paint(d.labelTextColor, rrect(gx0 - Q * 0.05, bow - Q * 0.045, Q * 0.1, Q * 0.08, [Q * 0.025, Q * 0.025, Q * 0.025, Q * 0.025]), bowLine) +
        (text ? textAt(gx0, qy + Q + tb / 2, tb, W - 2 * ov) : '');
    } else if (label === 'ticket') {
      // Vé mời: khoét nửa hình tròn hai bên, đường xé nét đứt ngăn phần mã với cuống vé ghi chữ
      var tp = Q * 0.06, stub = text ? band * 1.1 : Q * 0.12, nr = Q * 0.05, tr = Q * 0.05;
      W = Q + 2 * tp; qx = tp; qy = tp;
      var ny = tp * 1.9 + Q;
      H = ny + stub;
      var A = function (r, sweep, x, y) { return 'A' + r2(r) + ' ' + r2(r) + ' 0 0 ' + sweep + ' ' + r2(x) + ' ' + r2(y); };
      deco = paint(d.labelColor, 'M' + r2(tr) + ' 0H' + r2(W - tr) + A(tr, 1, W, tr) + 'V' + r2(ny - nr) + A(nr, 0, W, ny + nr) + 'V' + r2(H - tr) +
          A(tr, 1, W - tr, H) + 'H' + r2(tr) + A(tr, 1, 0, H - tr) + 'V' + r2(ny + nr) + A(nr, 0, 0, ny - nr) + 'V' + r2(tr) + A(tr, 1, tr, 0) + 'Z') +
        line('M' + r2(nr + Q * 0.03) + ' ' + r2(ny) + 'H' + r2(W - nr - Q * 0.03), Q * 0.008, ' stroke-opacity=".6" stroke-dasharray="' + r2(Q * 0.022) + ' ' + r2(Q * 0.016) + '"', 'butt') +
        paint(d.labelTextColor, star(nr + Q * 0.09, ny + stub / 2, Q * 0.032, Q * 0.014) + star(W - nr - Q * 0.09, ny + stub / 2, Q * 0.032, Q * 0.014)) +
        (text ? textAt(W / 2, ny + stub / 2, stub, W - 2 * (nr + Q * 0.15)) : '');
    } else if (label === 'polaroid') {
      // Ảnh polaroid: viền mỏng, đáy dày ghi chữ như viết tay, mẩu băng dính dán phía trên
      var pw = Q * 0.06, pb = text ? Q * 0.24 : Q * 0.15, tape = Q * 0.05, tw = Q * 0.32;
      W = Q + 2 * pw; qx = pw; qy = tape + pw; H = qy + Q + pb;
      deco = paint(d.labelColor, rrect(Q * 0.002, tape, W - Q * 0.004, H - tape - Q * 0.002, [Q * 0.012, Q * 0.012, Q * 0.012, Q * 0.012]),
          ' stroke="#000000" stroke-opacity=".1" stroke-width="' + r2(Q * 0.004) + '"') +
        '<rect x="' + r2(W / 2 - tw / 2) + '" y="' + r2(tape * 0.15) + '" width="' + r2(tw) + '" height="' + r2(tape * 1.7) + '" fill="' + d.labelTextColor +
          '" fill-opacity=".3" transform="rotate(-4 ' + r2(W / 2) + ' ' + r2(tape) + ')"/>' +
        (text ? textAt(W / 2, qy + Q + pb / 2, pb, W - 2 * pw, { family: HAND, weight: 400, fill: 0.42, wide: 0.55, spacing: 0 }) : '');
    }

    // Màu: 1 màu hoặc dải màu (áp cho cả chấm và mắt, trừ khi mắt có màu riêng); tâm dải màu là tâm mã
    var defs = '', fill = d.fg, gid = 'qg' + (++uid);
    if (d.grad !== 'none') {
      var a = (d.angle - 90) * Math.PI / 180, cx = qx + offX + N * U / 2, cy = qy + offY + N * U / 2, len = (N * U) / 2;
      if (d.grad === 'linear') {
        defs = '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + r2(cx - Math.cos(a) * len) + '" y1="' + r2(cy - Math.sin(a) * len) +
          '" x2="' + r2(cx + Math.cos(a) * len) + '" y2="' + r2(cy + Math.sin(a) * len) + '"><stop offset="0" stop-color="' + d.fg + '"/><stop offset="1" stop-color="' + d.fg2 + '"/></linearGradient>';
      } else {
        defs = '<radialGradient id="' + gid + '" gradientUnits="userSpaceOnUse" cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(len * 1.25) +
          '"><stop offset="0" stop-color="' + d.fg + '"/><stop offset="1" stop-color="' + d.fg2 + '"/></radialGradient>';
      }
      fill = 'url(#' + gid + ')';
    }
    var eyeFill = d.eyeColor || fill, ballFill = d.eyeBallColor || d.eyeColor || fill;

    // Nền khối mã: theo hình (tròn / trái tim), hoặc vuông bo góc hợp với khung
    var round = { bottom: B, top: B, card: B * 1.5, gift: B, ticket: B, polaroid: Q * 0.006 }[label] || 0;
    var out = '<g transform="translate(' + r2(qx) + ' ' + r2(qy) + ')">';
    if (!d.transparent) {
      out += paint(d.bg, lay ? (d.shape === 'heart' ? heartOutline(lay.G, P, 1.03) : circle(Q / 2, Q / 2, lay.G * U / 2 + U * 0.6)) : rrect(0, 0, Q, Q, [round, round, round, round]));
    }
    if (decos) out += paint(fill, decos, ' fill-opacity=".3"');
    out += paint(fill, dots);
    if (aligns) out += paint(fill, aligns, ' fill-rule="evenodd"') + paint(fill, alignDots);
    // Khung mắt kiểu chấm là các chấm chồng nhau → tô kiểu nonzero để phần chồng không bị thủng
    out += paint(eyeFill, frames, ' fill-rule="' + (d.eyeFrame === 'dots' ? 'nonzero' : 'evenodd') + '"');
    out += paint(ballFill, balls);
    if (logo) {
      if (d.logoPlate !== 'none') {
        var px = logo.x - logo.pad, pyl = logo.y - logo.pad, ps = logo.s + logo.pad * 2;
        out += paint(d.transparent ? '#ffffff' : d.bg, d.logoPlate === 'circle' ? circle(px + ps / 2, pyl + ps / 2, ps / 2 * 1.08) : rrect(px, pyl, ps, ps, [U, U, U, U]));
      }
      out += '<image x="' + r2(logo.x) + '" y="' + r2(logo.y) + '" width="' + r2(logo.s) + '" height="' + r2(logo.s) +
        '" preserveAspectRatio="xMidYMid meet" href="' + d.logo + '" xlink:href="' + d.logo + '"/>';
    }
    out += '</g>';

    var size = Math.max(16, Math.round(opts.size || 512));
    var hpx = Math.round(size * H / W);
    var s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + size + '" height="' + hpx +
      '" viewBox="0 0 ' + r2(W) + ' ' + r2(H) + '">' + (opts.title ? '<title>' + esc(opts.title) + '</title>' : '') +
      (defs ? '<defs>' + defs + '</defs>' : '') + deco + out + '</svg>';
    return { svg: s, width: size, height: hpx };
  }

  // Ô mẫu phóng to 6×6 cho nút chọn kiểu chấm: ảnh thu nhỏ cả mã thì chấm chỉ vài điểm ảnh, không nhìn ra tim hay sao
  var SWATCH = ['110011', '010110', '111001', '100111', '101100', '011010'];
  function swatch(style, fg, size) {
    var on = function (x, y) { return y >= 0 && y < 6 && x >= 0 && x < 6 && SWATCH[y][x] === '1'; };
    var p = '';
    for (var y = 0; y < 6; y++) for (var x = 0; x < 6; x++) {
      if (on(x, y)) p += dotPath(normalize({ dot: style }).dot, x * U, y * U, { t: on(x, y - 1), r: on(x + 1, y), b: on(x, y + 1), l: on(x - 1, y) });
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="-6 -6 72 72"><path fill="' + color(fg, DEFAULT.fg) + '" d="' + p + '"/></svg>';
  }

  // Chấm hình vui (tim, sao, hoa, lấp lánh) và ô nhỏ phủ ít diện tích ô hơn, nên máy quét cần tâm mắt định vị thật chuẩn.
  // Thử quét cho thấy: ghép với khung mắt chuỗi hạt, hoặc lõi bông hoa trong khung vuông / lá, mã hay đọc trượt.
  var FANCY_DOTS = ['heart', 'star', 'flower', 'sparkle'];
  function riskyEyes(design) {
    var d = normalize(design);
    if (d.eyeFrame === 'dots') return FANCY_DOTS.indexOf(d.dot) >= 0 || d.dot === 'small';
    return FANCY_DOTS.indexOf(d.dot) >= 0 && d.eyeBall === 'flower' && d.eyeFrame !== 'rounded' && d.eyeFrame !== 'circle';
  }

  // Cảnh báo những thiết kế dễ làm mã khó quét
  function warnings(design) {
    var d = normalize(design), list = [];
    var bg = d.transparent ? '#ffffff' : d.bg;
    var colors = [d.fg].concat(d.grad !== 'none' ? [d.fg2] : [], d.eyeColor ? [d.eyeColor] : []);
    var worst = Math.min.apply(null, colors.map(function (c) { return contrast(c, bg); }));
    if (worst < 3) list.push('Màu mã và màu nền quá gần nhau, nhiều điện thoại sẽ không quét được. Nên dùng mã màu đậm trên nền sáng.');
    else if (colors.some(function (c) { return luminance(c) > luminance(bg); })) list.push('Mã sáng trên nền tối (đảo màu) một số ứng dụng quét cũ không đọc được.');
    if (d.margin < 2 && d.shape === 'square') list.push('Lề quanh mã hẹp, mã dễ bị lẫn với hình xung quanh khi in.');
    if (riskyEyes(d)) list.push('Kiểu chấm này ghép với kiểu mắt định vị đang chọn khó quét. Nên chọn khung mắt "Bo góc" hoặc "Tròn".');
    if (d.logo && d.logoSize > 0.26 && d.ecc !== 'H') list.push('Logo lớn: nên chọn mức sửa lỗi H để mã vẫn quét được.');
    return list;
  }

  return { svg: svg, alignCenters: alignCenters, normalize: normalize, warnings: warnings, contrast: contrast, luminance: luminance, DEFAULT: DEFAULT, DOTS: DOTS, FRAMES: FRAMES, BALLS: BALLS, LABELS: LABELS, SHAPES: SHAPES, FANCY_DOTS: FANCY_DOTS, riskyEyes: riskyEyes, shapeLayout: shapeLayout, inShape: inShape, swatch: swatch };
});
