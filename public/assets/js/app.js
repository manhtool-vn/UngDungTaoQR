/* ManhTool — Tạo mã QR chuyên nghiệp: giao diện tạo mã, thiết kế, tải về, tạo hàng loạt, đọc mã từ ảnh.
   Mã tĩnh tạo hoàn toàn trên trình duyệt (qr-core.js + qr-render.js). Mã động do codes.js quản lý qua máy chủ. */
(function () {
  'use strict';

  var QR = window.QRCore, R = window.QRRender, P = window.QRPayloads, Z = window.MiniZip;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = { state: 'mt-qr-state', presets: 'mt-qr-presets', nudge: 'mt-qr-nudge', theme: 'mt-theme' };
  var LEVEL = { L: 0, M: 1, Q: 2, H: 3 };
  var MAX_LOGO = 48 * 1024;

  /* ---------- Tiện ích ---------- */
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  var toastTimer;
  function toast(msg, label, fn) {
    var el = $('toast'), btn = $('toastAction');
    $('toastMsg').textContent = msg;
    btn.hidden = !label;
    el.classList.toggle('has-action', !!label);
    if (label) { btn.textContent = label; btn.onclick = function () { el.classList.remove('show'); fn(); }; }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, label ? 6000 : 2600);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(e); }
      t.remove();
    });
  }

  // Tên file gọn, không dấu
  function slug(s, max) {
    return P.plain(s).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max || 40).replace(/-+$/, '') || 'ma-qr';
  }

  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* ---------- Trạng thái ---------- */
  var saved = load(KEY.state) || {};
  var S = {
    type: saved.type || 'url',
    fields: saved.fields && typeof saved.fields === 'object' ? saved.fields : {},
    design: R.normalize(saved.design),
    dyn: null,       // đang thiết kế cho 1 mã động { id, slug, name, shortUrl, target }
    staticDesign: null, // thiết kế mã thường, giữ lại trong lúc sửa mã động
    last: null       // { text, qr } lần vẽ gần nhất
  };
  var persist = debounce(function () { store(KEY.state, { type: S.type, fields: S.fields, design: S.dyn ? S.staticDesign : S.design }); }, 400);

  /* ---------- Nội dung theo loại mã ---------- */
  var TYPES = {
    url: { build: function (f) { return P.url(f.url); }, empty: 'Nhập đường dẫn để tạo mã', name: function (f) { return f.url; } },
    text: { build: function (f) { return f.text || ''; }, empty: 'Nhập nội dung để tạo mã', name: function (f) { return f.text; } },
    wifi: { build: function (f) { return P.wifi(f); }, empty: 'Nhập tên Wi-Fi để tạo mã', name: function (f) { return 'wifi-' + (f.ssid || ''); } },
    bank: { build: function (f) { return P.vietqr(f); }, empty: 'Chọn ngân hàng và nhập số tài khoản', name: function (f) { return 'chuyen-khoan-' + (f.account || ''); } },
    vcard: { build: function (f) { return P.vcard(f); }, empty: 'Nhập họ tên hoặc tên công ty', name: function (f) { return 'danh-thiep-' + [f.lastName, f.firstName].join(' '); } },
    phone: { build: function (f) { return P.phone(f.phone); }, empty: 'Nhập số điện thoại', name: function (f) { return 'goi-' + (f.phone || ''); } },
    zalo: { build: function (f) { return P.zalo(f.zaloPhone); }, empty: 'Nhập số điện thoại Zalo', name: function (f) { return 'zalo-' + (f.zaloPhone || ''); } },
    sms: { build: function (f) { return P.sms({ phone: f.smsPhone, body: f.body }); }, empty: 'Nhập số điện thoại nhận tin', name: function (f) { return 'sms-' + (f.smsPhone || ''); } },
    email: { build: function (f) { return P.email({ to: f.to, subject: f.subject, body: f.mailBody }); }, empty: 'Nhập địa chỉ email', name: function (f) { return 'email-' + (f.to || ''); } },
    geo: { build: function (f) { return P.geo(f); }, empty: 'Nhập địa chỉ hoặc tọa độ', name: function (f) { return 'vi-tri-' + (f.query || ''); } },
    event: { build: function (f) { return P.event({ title: f.evTitle, start: f.start, end: f.end, location: f.location, desc: f.desc }); }, empty: 'Nhập tên và giờ bắt đầu sự kiện', name: function (f) { return 'su-kien-' + (f.evTitle || ''); } }
  };
  if (!TYPES[S.type]) S.type = 'url';

  function content() { return S.dyn ? S.dyn.shortUrl : TYPES[S.type].build(S.fields); }
  function fileBase() { return slug(S.dyn ? 'ma-dong-' + S.dyn.slug : TYPES[S.type].name(S.fields) || 'ma-qr'); }

  // Có logo → tối thiểu mức Q, mặc định H để vẫn quét được khi giữa mã bị che
  function eccFor(d) { return d.logo && LEVEL[d.ecc] < 2 ? 'H' : d.ecc; }

  function encode(text, design) {
    return QR.encode(text, { ecc: eccFor(design || S.design) });
  }

  // Chuỗi SVG cho 1 nội dung + thiết kế bất kỳ (codes.js dùng để vẽ ảnh nhỏ / tải mã động)
  function svgFor(text, design, size) {
    var d = R.normalize(design);
    return R.svg(encode(text, d), d, { size: size || 512 });
  }

  /* ---------- Vẽ xem trước ---------- */
  var preview = $('preview');
  function render() {
    var text = content();
    var empty = $('previewEmpty');
    S.last = null;
    $('scanResult').hidden = true;
    if (!text) {
      preview.innerHTML = '';
      empty.hidden = false;
      $('previewEmptyText').textContent = TYPES[S.type].empty;
      $('previewMeta').textContent = '';
      $('warnBox').hidden = true;
      setDownloads(false);
      return;
    }
    var qr;
    try { qr = encode(text); } catch (e) {
      preview.innerHTML = '';
      empty.hidden = false;
      $('previewEmptyText').textContent = e.code === 'too_long' ? 'Nội dung quá dài để tạo mã QR (tối đa khoảng ' + QR.maxBytes(eccFor(S.design)) + ' byte). Hãy rút gọn hoặc dùng mã động.' : 'Không tạo được mã';
      $('previewMeta').textContent = '';
      setDownloads(false);
      return;
    }
    empty.hidden = true;
    S.last = { text: text, qr: qr };
    preview.innerHTML = R.svg(qr, S.design, { size: 600 }).svg;
    preview.parentNode.classList.toggle('is-transparent', !!S.design.transparent);
    preview.classList.toggle('is-rounded', S.design.margin >= 1 && !S.design.transparent);
    var meta = 'Phiên bản ' + qr.version + ' · ' + qr.size + '×' + qr.size + ' ô · sửa lỗi ' + qr.ecc;
    if (S.design.logo && S.design.ecc !== qr.ecc && LEVEL[S.design.ecc] < 2) meta += ' (vì có logo)';
    // Mã hình tròn / trái tim chỉ chiếm ~60% bức ảnh → nhắc in to hơn mã vuông
    if (S.design.shape !== 'square') meta += ' · nên in từ 3 cm';
    $('previewMeta').textContent = meta;
    var warns = R.warnings(Object.assign({}, S.design, { ecc: qr.ecc }));
    if (qr.version >= 15 && !S.dyn) warns.push('Nội dung dài nên mã rất dày chấm, cần in to mới quét được. Với đường dẫn dài, mã động sẽ gọn hơn nhiều.');
    var wb = $('warnBox');
    wb.hidden = !warns.length;
    wb.textContent = '';
    warns.forEach(function (w) {
      var p = document.createElement('p');
      p.innerHTML = '<svg class="ic"><use href="#i-alert"/></svg>';
      p.appendChild(document.createTextNode(w));
      wb.appendChild(p);
    });
    setDownloads(true);
  }
  var renderSoon = (function () {
    var pending = false;
    return function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; render(); });
    };
  })();

  function setDownloads(on) {
    ['dlPng', 'dlSvg', 'btnCopyImg', 'btnJpg', 'btnPrint', 'btnCheck'].forEach(function (id) { $(id).disabled = !on; });
  }

  /* ---------- Xuất ảnh ---------- */
  function rasterize(text, design, size, type) {
    var d = R.normalize(design);
    var out = R.svg(encode(text, d), d, { size: size });
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = out.width;
        c.height = out.height;
        var ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? ok(b) : fail(new Error('Không tạo được ảnh')); }, type || 'image/png', 0.92);
      };
      img.onerror = function () { fail(new Error('Không vẽ được ảnh')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out.svg);
    });
  }

  function dlSize() { return Number($('dlSize').value) || 1024; }

  $('dlPng').addEventListener('click', function () {
    if (!S.last) return;
    rasterize(S.last.text, S.design, dlSize()).then(function (b) { saveBlob(b, fileBase() + '.png'); }, function (e) { toast(e.message); });
  });
  $('btnJpg').addEventListener('click', function () {
    if (!S.last) return;
    rasterize(S.last.text, S.design, dlSize(), 'image/jpeg').then(function (b) { saveBlob(b, fileBase() + '.jpg'); }, function (e) { toast(e.message); });
  });
  $('dlSvg').addEventListener('click', function () {
    if (!S.last) return;
    var out = R.svg(S.last.qr, S.design, { size: 1024, title: S.last.text.slice(0, 200) });
    saveBlob(new Blob([out.svg], { type: 'image/svg+xml' }), fileBase() + '.svg');
  });
  $('btnCopyImg').addEventListener('click', function () {
    if (!S.last) return;
    if (!navigator.clipboard || !window.ClipboardItem) { toast('Trình duyệt này chưa hỗ trợ chép ảnh, hãy tải PNG'); return; }
    var blob = rasterize(S.last.text, S.design, 1024);
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
      toast('Đã chép ảnh mã QR, dán vào Zalo, Word… là được');
    }, function () { toast('Không chép được ảnh, hãy tải PNG'); });
  });
  $('btnPrint').addEventListener('click', function () {
    if (!S.last) return;
    $('printArea').innerHTML = R.svg(S.last.qr, S.design, { size: 600 }).svg;
    window.print();
  });

  /* ---------- Thử quét: giải mã lại chính ảnh vừa thiết kế (jsQR, tải khi cần) ---------- */
  var jsqrLoading = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (!jsqrLoading) {
      jsqrLoading = new Promise(function (ok, fail) {
        var s = document.createElement('script');
        s.src = 'assets/vendor/jsQR.js';
        s.onload = function () { ok(window.jsQR); };
        s.onerror = function () { jsqrLoading = null; fail(new Error('Không tải được bộ đọc mã')); };
        document.head.appendChild(s);
      });
    }
    return jsqrLoading;
  }

  function decodeBlob(blob) {
    var bitmap = createImageBitmap(blob).catch(function () { throw new Error('Không đọc được file ảnh này, hãy thử ảnh PNG hoặc JPG khác'); });
    return Promise.all([loadJsQR(), bitmap]).then(function (r) {
      var bmp = r[1], k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      var data = ctx.getImageData(0, 0, c.width, c.height);
      return r[0](data.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    });
  }

  function sameBytes(a, b) {
    if (!a || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Mô phỏng ảnh camera chụp: mã chiếm vài trăm điểm ảnh, có lề, hơi mờ. Camera thử nhiều khung hình liên tục
  // nên mã coi là "quét tốt" khi đọc được ở phần lớn các lần thử.
  var CAMERA = [[300, 0.8], [360, 0], [240, 0.6], [480, 0.8], [420, 0], [640, 1.2]];
  function cameraDecode(text, design, size, blur) {
    return Promise.all([loadJsQR(), rasterize(text, design, size).then(createImageBitmap)]).then(function (r) {
      var bmp = r[1], pad = Math.round(size * 0.15);
      var c = document.createElement('canvas');
      c.width = bmp.width + pad * 2;
      c.height = bmp.height + pad * 2;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      if (blur) ctx.filter = 'blur(' + blur + 'px)';
      ctx.drawImage(bmp, pad, pad);
      var res = r[0](ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
      return !!(res && sameBytes(res.binaryData, QR.utf8(text)));
    });
  }

  $('btnCheck').addEventListener('click', function () {
    if (!S.last) return;
    var text = S.last.text, design = S.design, box = $('scanResult'), btn = this;
    box.hidden = false;
    box.className = 'scan-result';
    box.textContent = 'Đang thử quét…';
    btn.disabled = true;
    var ok = 0;
    CAMERA.reduce(function (p, a) {
      return p.then(function () { return cameraDecode(text, design, a[0], a[1]).then(function (y) { if (y) ok++; }); });
    }, Promise.resolve()).then(function () {
      var good = ok >= CAMERA.length - 1;
      box.className = 'scan-result ' + (good ? 'is-ok' : ok ? 'is-warn' : 'is-bad');
      box.innerHTML = '<svg class="ic"><use href="#i-' + (good ? 'check-circle' : 'alert') + '"/></svg>';
      box.appendChild(document.createTextNode(good
        ? 'Đọc được ' + ok + '/' + CAMERA.length + ' lần thử như ảnh chụp từ camera. Vẫn nên quét bằng điện thoại trước khi in nhiều.'
        : ok ? 'Chỉ đọc được ' + ok + '/' + CAMERA.length + ' lần thử. Mã quét được nhưng chưa ổn định: tăng tương phản, thu nhỏ logo hoặc chọn kiểu chấm, mắt đơn giản hơn.'
          : 'Không đọc được ở lần thử nào. Hãy tăng tương phản màu, thu nhỏ logo, chọn kiểu chấm đơn giản hơn hoặc tăng mức sửa lỗi.'));
    }, function (e) { box.className = 'scan-result is-bad'; box.textContent = e.message; })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- Loại mã + ô nhập ---------- */
  var form = $('typeForm');

  function fillBanks() {
    var sel = $('bankSelect');
    var o = document.createElement('option');
    o.value = ''; o.textContent = 'Chọn ngân hàng…';
    sel.appendChild(o);
    P.BANKS.forEach(function (b) {
      var x = document.createElement('option');
      x.value = b.bin; x.textContent = b.name;
      sel.appendChild(x);
    });
  }

  function writeFields() {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === 'dynTarget') return;
      var v = S.fields[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (v != null) el.value = v;
    });
    updateTextCount();
  }

  function updateTextCount() {
    var t = S.fields.text || '';
    var n = QR.utf8(t).length;
    $('textCount').textContent = t ? n + ' byte' + (n > 300 ? ' · nội dung dài, mã sẽ dày chấm' : '') : '';
  }

  function setType(type, focus) {
    if (!TYPES[type]) return;
    S.type = type;
    document.querySelectorAll('.type-btn').forEach(function (b) {
      var on = b.dataset.type === type;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.classList.toggle('is-active', on);
    });
    // Hàng loại mã cuộn ngang trên điện thoại: kéo nút đang chọn vào tầm nhìn
    var row = $('types'), act = row.querySelector('.is-active');
    if (act && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, act.offsetLeft - row.offsetLeft - 24);
    form.querySelectorAll('.tf').forEach(function (f) { f.hidden = S.dyn ? f.dataset.type !== 'dyn' : f.dataset.type !== type; });
    $('dynCard').hidden = !!S.dyn || type !== 'url';
    persist();
    renderSoon();
    if (focus) {
      var first = form.querySelector('.tf[data-type="' + type + '"] input, .tf[data-type="' + type + '"] textarea, .tf[data-type="' + type + '"] select');
      if (first && window.matchMedia('(hover: hover)').matches) first.focus();
    }
  }

  $('types').addEventListener('click', function (e) {
    var b = e.target.closest('.type-btn');
    if (b) setType(b.dataset.type, true);
  });

  form.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.name) return;
    if (el.name === 'dynTarget') { $('dynSaveTarget').disabled = !S.dyn || el.value.trim() === S.dyn.target; return; }
    S.fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.name === 'text') updateTextCount();
    persist();
    renderSoon();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.querySelector('select[name="auth"]').addEventListener('change', function () { S.fields.auth = this.value; persist(); renderSoon(); });
  $('bankSelect').addEventListener('change', function () { S.fields.bin = this.value; persist(); renderSoon(); });

  /* ---------- Thiết kế ---------- */
  var THUMB_QR = null;
  function thumbQr() { return THUMB_QR || (THUMB_QR = QR.encode('MANHTOOL.ID.VN', { ecc: 'L', boostEcc: false })); }

  function setDesign(patch, silent) {
    S.design = R.normalize(Object.assign({}, S.design, patch));
    persist();
    if (!silent) syncDesignUI();
    renderSoon();
  }

  // Ảnh nhỏ minh họa 1 lựa chọn thiết kế
  // Màu cho ảnh minh họa: màu mã hiện tại, trừ khi quá nhạt trên nền trắng của nút
  function tint(hex, t) {
    var n = parseInt(hex.slice(1), 16), out = '#';
    for (var i = 16; i >= 0; i -= 8) out += ('0' + Math.round(((n >> i) & 255) * (1 - t) + 255 * t).toString(16)).slice(-2);
    return out;
  }
  function thumbFg() { return R.contrast(S.design.fg, '#ffffff') < 2 ? '#0f2620' : S.design.fg; }
  function thumb(patch, size) {
    var base = { fg: thumbFg(), bg: '#ffffff', margin: 1, eyeColor: S.design.eyeColor, eyeBallColor: S.design.eyeBallColor, dot: S.design.dot, eyeFrame: S.design.eyeFrame, eyeBall: S.design.eyeBall };
    return R.svg(thumbQr(), Object.assign(base, patch), { size: size || 56 }).svg;
  }

  var SHAPE_NAMES = { square: 'Vuông', circle: 'Tròn', heart: 'Trái tim' };
  var DOT_NAMES = {
    square: 'Vuông', rounded: 'Bo liền', dots: 'Chấm tròn', classy: 'Thanh lịch', diamond: 'Kim cương', small: 'Ô nhỏ', vbars: 'Sọc dọc', hbars: 'Sọc ngang',
    heart: 'Trái tim', star: 'Ngôi sao', flower: 'Bông hoa', sparkle: 'Lấp lánh'
  };
  var FRAME_NAMES = { square: 'Vuông', rounded: 'Bo góc', circle: 'Tròn', leaf: 'Lá', dots: 'Chấm' };
  var BALL_NAMES = { square: 'Vuông', rounded: 'Bo góc', circle: 'Tròn', leaf: 'Lá', flower: 'Bông hoa' };
  var LABEL_NAMES = {
    none: 'Không khung', bottom: 'Dải dưới', top: 'Dải trên', pill: 'Nhãn', bubble: 'Bong bóng',
    card: 'Thiệp', gift: 'Hộp quà', ticket: 'Vé mời', polaroid: 'Polaroid'
  };

  // Chọn chấm hình vui khi đang dùng kiểu mắt dễ làm mã đọc trượt → đổi khung mắt sang "Bo góc" (hoàn tác được)
  function pickDesign(key, v) {
    var p = {};
    p[key] = v;
    var next = Object.assign({}, S.design, p);
    if (key === 'dot' && R.riskyEyes(next)) {
      var before = S.design;
      p.eyeFrame = 'rounded';
      setDesign(p);
      toast('Đã đổi khung mắt sang "Bo góc" để mã vẫn quét tốt', 'Hoàn tác', function () { setDesign(before); });
      return;
    }
    setDesign(p);
  }

  function styleGrid(id, key, names) {
    var box = $(id);
    box.textContent = '';
    Object.keys(names).forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'style-opt';
      b.setAttribute('role', 'radio');
      b.dataset.v = v;
      b.title = names[v];
      var patch = {};
      patch[key] = v;
      if (key === 'label') { patch.labelText = 'QUÉT MÃ'; patch.labelColor = S.design.labelColor; patch.labelTextColor = S.design.labelTextColor; }
      // Hình dáng: nền nhạt theo màu mã để thấy rõ dáng tròn / trái tim trên nút trắng
      if (key === 'shape') patch.bg = tint(thumbFg(), 0.88);
      // Kiểu chấm: ô mẫu phóng to cho thấy rõ hình từng chấm; các kiểu khác: ảnh thu nhỏ cả mã
      b.innerHTML = (key === 'dot' ? R.swatch(v, thumbFg(), 56) : thumb(patch, key === 'label' || key === 'shape' ? 64 : 56)) + '<span></span>';
      b.firstChild.setAttribute('aria-hidden', 'true');
      b.lastChild.textContent = names[v];
      b.addEventListener('click', function () { pickDesign(key, v); });
      box.appendChild(b);
    });
  }

  function renderThumbs() {
    styleGrid('shapeGrid', 'shape', SHAPE_NAMES);
    styleGrid('dotGrid', 'dot', DOT_NAMES);
    styleGrid('eyeFrameGrid', 'eyeFrame', FRAME_NAMES);
    styleGrid('eyeBallGrid', 'eyeBall', BALL_NAMES);
    styleGrid('labelGrid', 'label', LABEL_NAMES);
    markThumbs();
  }
  var renderThumbsSoon = debounce(renderThumbs, 250);

  function markThumbs() {
    [['shapeGrid', 'shape'], ['dotGrid', 'dot'], ['eyeFrameGrid', 'eyeFrame'], ['eyeBallGrid', 'eyeBall'], ['labelGrid', 'label']].forEach(function (g) {
      $(g[0]).querySelectorAll('.style-opt').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.v === S.design[g[1]] ? 'true' : 'false'); });
    });
  }

  var lastThumbKey = '';
  function syncDesignUI() {
    var d = S.design;
    document.querySelectorAll('[data-k]').forEach(function (el) {
      var k = el.dataset.k, v = d[k];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'color') el.value = v || (k === 'eyeBallColor' ? (d.eyeColor || d.fg) : d.fg);
      else if (document.activeElement !== el) el.value = v;
    });
    document.querySelectorAll('[data-hex]').forEach(function (el) {
      if (document.activeElement === el) return;
      var k = el.dataset.hex;
      el.value = d[k] || '';
      el.placeholder = k === 'eyeBallColor' ? (d.eyeColor || d.fg) : d.fg;
    });
    document.querySelectorAll('[data-radio]').forEach(function (g) {
      g.querySelectorAll('[role="radio"]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.v === d[g.dataset.radio] ? 'true' : 'false'); });
    });
    $('gradRow').hidden = d.grad === 'none';
    $('angleField').hidden = d.grad !== 'linear';
    $('angleVal').textContent = d.angle + '°';
    $('marginVal').textContent = d.margin + ' ô';
    $('logoSizeVal').textContent = Math.round(d.logoSize * 100) + '%';
    $('eyeOwn').checked = !!(d.eyeColor || d.eyeBallColor);
    $('eyeColors').hidden = !$('eyeOwn').checked;
    $('logoOpts').hidden = !d.logo;
    $('logoPreview').hidden = !d.logo;
    $('logoEmpty').hidden = !!d.logo;
    if (d.logo) $('logoPreview').src = d.logo;
    $('labelOpts').hidden = d.label === 'none';
    markThumbs();
    // Ảnh minh họa đổi theo màu và kiểu đang chọn
    var key = [d.fg, d.eyeColor, d.eyeBallColor, d.dot, d.eyeFrame, d.eyeBall, d.labelColor, d.labelTextColor].join();
    if (key !== lastThumbKey) { lastThumbKey = key; renderThumbsSoon(); }
  }

  // Ô chọn màu, thanh trượt, công tắc
  document.querySelectorAll('[data-k]').forEach(function (el) {
    el.addEventListener('input', function () {
      var p = {}, k = el.dataset.k;
      p[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      setDesign(p);
    });
  });
  // Ô gõ mã màu #RRGGBB
  document.querySelectorAll('[data-hex]').forEach(function (el) {
    el.addEventListener('input', function () {
      var v = el.value.trim();
      if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { var p = {}; p[el.dataset.hex] = v; setDesign(p); el.classList.remove('is-bad'); }
      else el.classList.toggle('is-bad', v.length >= 4);
    });
    el.addEventListener('blur', function () { el.classList.remove('is-bad'); syncDesignUI(); });
  });
  document.querySelectorAll('[data-radio]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('[role="radio"]');
      if (!b) return;
      var p = {};
      p[g.dataset.radio] = b.dataset.v;
      setDesign(p);
    });
  });

  $('eyeOwn').addEventListener('change', function () {
    if (this.checked) setDesign({ eyeColor: S.design.fg, eyeBallColor: S.design.fg });
    else setDesign({ eyeColor: '', eyeBallColor: '' });
  });
  $('swapColors').addEventListener('click', function () { setDesign({ fg: S.design.bg, bg: S.design.fg }); });
  $('resetDesign').addEventListener('click', function () {
    var before = S.design;
    setDesign(R.DEFAULT);
    toast('Đã về thiết kế mặc định', 'Hoàn tác', function () { setDesign(before); });
  });

  // Màu gợi ý
  ['#000000', '#0f2620', '#0e7c5a', '#1864ab', '#5f3dc4', '#a61e4d', '#c92a2a', '#d9480f', '#7c4a1d', '#495057'].forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c;
    b.title = c;
    b.setAttribute('aria-label', 'Màu ' + c);
    b.addEventListener('click', function () { setDesign({ fg: c }); });
    $('quickColors').appendChild(b);
  });

  // Chữ gợi ý cho khung
  ['QUÉT MÃ', 'QUÉT ĐỂ THANH TOÁN', 'KẾT NỐI WI-FI', 'XEM MENU', 'LƯU DANH BẠ', 'NHẬN ƯU ĐÃI', 'Thiệp mời', 'Cảm ơn bạn', 'CHÚC MỪNG SINH NHẬT', 'Yêu thương', 'VÉ MỜI'].forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t;
    b.addEventListener('click', function () { setDesign({ labelText: t }); });
    $('quickTexts').appendChild(b);
  });

  // Thẻ thiết kế
  document.querySelector('.design-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    document.querySelectorAll('.design-tabs [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
    document.querySelectorAll('.dpanel').forEach(function (p) { p.hidden = p.dataset.panel !== b.dataset.tab; });
  });

  /* ---------- Mẫu thiết kế ---------- */
  var PRESETS = [
    { name: 'Cổ điển', d: {} },
    // Cuối dải màu là xanh lá đậm vừa đủ: xanh chanh nhạt hơn làm máy quét đọc trượt
    { name: 'ManhTool', d: { fg: '#0e7c5a', grad: 'linear', fg2: '#2f9e44', angle: 135, dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', eyeColor: '#0f2620', eyeBallColor: '#0e7c5a' } },
    { name: 'Valentine', d: { fg: '#c2255c', shape: 'heart', dot: 'heart', eyeFrame: 'rounded', eyeBall: 'circle' } },
    { name: 'Sinh nhật', d: { fg: '#5f3dc4', grad: 'linear', fg2: '#c2255c', angle: 135, dot: 'star', eyeFrame: 'rounded', eyeBall: 'flower', label: 'gift', labelText: 'CHÚC MỪNG SINH NHẬT', labelColor: '#e64980', labelTextColor: '#ffffff' } },
    { name: 'Thiệp cưới', d: { fg: '#a61e4d', dot: 'flower', eyeFrame: 'rounded', eyeBall: 'rounded', label: 'card', labelText: 'Trân trọng kính mời', labelColor: '#fff0f3', labelTextColor: '#a61e4d' } },
    { name: 'Lấp lánh', d: { fg: '#1c2a6b', grad: 'radial', fg2: '#5f3dc4', dot: 'sparkle', eyeFrame: 'circle', eyeBall: 'circle' } },
    { name: 'Tròn xoe', d: { fg: '#0b7285', shape: 'circle', dot: 'dots', eyeFrame: 'circle', eyeBall: 'circle' } },
    { name: 'Vé sự kiện', d: { fg: '#212529', dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', label: 'ticket', labelText: 'VÉ MỜI', labelColor: '#fab005', labelTextColor: '#212529' } },
    { name: 'Polaroid', d: { fg: '#343a40', dot: 'dots', eyeFrame: 'circle', eyeBall: 'circle', label: 'polaroid', labelText: 'Kỷ niệm của chúng mình', labelColor: '#ffffff', labelTextColor: '#495057' } },
    { name: 'Chấm tròn', d: { fg: '#1864ab', dot: 'dots', eyeFrame: 'circle', eyeBall: 'circle' } },
    { name: 'Đại dương', d: { fg: '#1864ab', grad: 'radial', fg2: '#0b7285', dot: 'classy', eyeFrame: 'leaf', eyeBall: 'leaf' } },
    { name: 'Hoàng hôn', d: { fg: '#c2255c', grad: 'linear', fg2: '#e8590c', angle: 45, dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'circle' } },
    { name: 'Kim cương', d: { fg: '#5f3dc4', dot: 'diamond', eyeFrame: 'rounded', eyeBall: 'rounded' } },
    { name: 'Thanh lịch', d: { fg: '#212529', dot: 'small', eyeFrame: 'circle', eyeBall: 'circle', eyeColor: '#a61e4d', eyeBallColor: '#a61e4d' } },
    { name: 'Sọc dọc', d: { fg: '#0b7285', dot: 'vbars', eyeFrame: 'rounded', eyeBall: 'rounded' } },
    { name: 'Thực đơn', d: { fg: '#7c4a1d', bg: '#fff8ef', dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', label: 'bottom', labelText: 'XEM MENU', labelColor: '#7c4a1d', labelTextColor: '#fff8ef' } },
    { name: 'Thanh toán', d: { fg: '#0f2620', dot: 'square', label: 'top', labelText: 'QUÉT ĐỂ THANH TOÁN', labelColor: '#0e7c5a', labelTextColor: '#ffffff' } },
    { name: 'Tết', d: { fg: '#c92a2a', bg: '#fff9db', dot: 'classy', eyeFrame: 'leaf', eyeBall: 'leaf', eyeColor: '#d9480f', eyeBallColor: '#c92a2a', label: 'bubble', labelText: 'NHẬN LÌ XÌ', labelColor: '#c92a2a', labelTextColor: '#fff9db' } },
    { name: 'Đêm', d: { fg: '#0c1613', bg: '#ffffff', dot: 'hbars', eyeFrame: 'rounded', eyeBall: 'rounded', label: 'pill', labelText: 'QUÉT MÃ', labelColor: '#0c1613', labelTextColor: '#c4e43a' } }
  ];

  function presetButton(p, onPick, onDel) {
    var wrap = document.createElement('div');
    wrap.className = 'preset';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    b.title = 'Dùng mẫu ' + p.name;
    var d = R.normalize(Object.assign({}, R.DEFAULT, p.d, { margin: 2 }));
    b.innerHTML = R.svg(thumbQr(), d, { size: 76 }).svg + '<span></span>';
    b.firstChild.setAttribute('aria-hidden', 'true');
    b.lastChild.textContent = p.name;
    b.addEventListener('click', onPick);
    wrap.appendChild(b);
    if (onDel) {
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'preset-del';
      x.setAttribute('aria-label', 'Xóa mẫu ' + p.name);
      x.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>';
      x.addEventListener('click', onDel);
      wrap.appendChild(x);
    }
    return wrap;
  }

  function renderPresets() {
    var box = $('presetGrid');
    box.textContent = '';
    PRESETS.forEach(function (p) {
      box.appendChild(presetButton(p, function () {
        // Áp mẫu nhưng giữ logo đang dùng
        var before = S.design;
        setDesign(Object.assign({}, R.DEFAULT, p.d, { logo: S.design.logo, logoSize: S.design.logoSize, logoPlate: S.design.logoPlate }));
        toast('Đã áp mẫu ' + p.name, 'Hoàn tác', function () { setDesign(before); });
      }));
    });
    renderMyPresets();
  }

  function myPresets() { var v = load(KEY.presets); return Array.isArray(v) ? v : []; }
  function renderMyPresets() {
    var box = $('myPresetGrid'), list = myPresets();
    box.textContent = '';
    list.forEach(function (p, i) {
      box.appendChild(presetButton({ name: p.name, d: p.design }, function () { setDesign(p.design); }, function () {
        var all = myPresets();
        var gone = all.splice(i, 1)[0];
        store(KEY.presets, all);
        renderMyPresets();
        toast('Đã xóa mẫu ' + gone.name, 'Hoàn tác', function () { var a = myPresets(); a.splice(i, 0, gone); store(KEY.presets, a); renderMyPresets(); });
      }));
    });
    $('myPresetEmpty').hidden = list.length > 0;
  }
  $('savePreset').addEventListener('click', function () {
    var list = myPresets();
    if (list.length >= 12) { toast('Đã đủ 12 mẫu, hãy xóa bớt mẫu cũ'); return; }
    list.unshift({ name: 'Mẫu ' + (list.length + 1), design: S.design });
    if (!store(KEY.presets, list)) { toast('Bộ nhớ trình duyệt đã đầy, hãy dùng logo nhỏ hơn'); return; }
    renderMyPresets();
  });

  /* ---------- Logo ---------- */
  // Thu nhỏ ảnh về tối đa 256px rồi lưu dạng PNG (giữ nền trong suốt) để file gọn và vẽ nhanh
  function readLogo(file) {
    if (!file || !/^image\//.test(file.type)) { toast('Hãy chọn file ảnh (PNG, JPG, SVG…)'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('Ảnh quá lớn, hãy chọn ảnh dưới 8MB'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var max = 256, w = img.naturalWidth || max, h = img.naturalHeight || max;
      var k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var data = c.toDataURL('image/png');
      // Ảnh chụp nhiều chi tiết → PNG nặng, đổi sang WebP cho gọn
      if (data.length > MAX_LOGO * 1.37) data = c.toDataURL('image/webp', 0.86);
      if (data.length > MAX_LOGO * 1.37) { c.width = Math.round(c.width / 2); c.height = Math.round(c.height / 2); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); data = c.toDataURL('image/webp', 0.8); }
      URL.revokeObjectURL(url);
      setDesign({ logo: data, logoPlate: S.design.logoPlate });
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('Không đọc được ảnh này'); };
    img.src = url;
  }
  $('logoDrop').addEventListener('click', function () { $('logoInput').click(); });
  $('logoDrop').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('logoInput').click(); } });
  $('logoInput').addEventListener('change', function () { readLogo(this.files[0]); this.value = ''; });
  dropZone($('logoDrop'), readLogo);
  $('logoRemove').addEventListener('click', function () { setDesign({ logo: '' }); });

  // Biểu tượng có sẵn: vẽ thành SVG trên nền tròn màu mã
  var ICONS = {
    wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 19.5h.01',
    phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7',
    pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    cart: 'M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L22 7H6M10 21h.01M18 21h.01',
    coffee: 'M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2',
    heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
    star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
    bank: 'M3 21h18M5 21v-9M19 21v-9M9.5 21v-9M14.5 21v-9M2 10l10-6 10 6z',
    gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    cake: 'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01',
    flower: 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M7.5 12a4.5 4.5 0 1 0 4.5 4.5M16.5 12a4.5 4.5 0 1 1-4.5 4.5',
    smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
    music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 1 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 1 1 6 0z'
  };
  var ICON_NAMES = {
    wifi: 'Wi-Fi', phone: 'điện thoại', mail: 'thư', pin: 'vị trí', link: 'đường dẫn', cart: 'giỏ hàng', coffee: 'cà phê', heart: 'trái tim', star: 'ngôi sao',
    bank: 'ngân hàng', gift: 'hộp quà', cake: 'bánh sinh nhật', flower: 'bông hoa', smile: 'mặt cười', music: 'nốt nhạc'
  };
  function iconLogo(path, colorHex) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="' + colorHex + '"/>' +
      '<g transform="translate(12 12)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></g></svg>';
    return 'data:image/svg+xml;base64,' + btoa(s);
  }
  Object.keys(ICONS).forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-logo';
    b.setAttribute('aria-label', 'Dùng biểu tượng ' + ICON_NAMES[k]);
    b.title = 'Biểu tượng ' + ICON_NAMES[k];
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24"><path d="' + ICONS[k] + '"/></svg>';
    b.addEventListener('click', function () {
      var c = R.contrast(S.design.fg, '#ffffff') > 3 ? S.design.fg : '#0e7c5a';
      setDesign({ logo: iconLogo(ICONS[k], c), logoPlate: 'circle', logoSize: Math.min(S.design.logoSize, 0.22) });
    });
    $('iconLogos').appendChild(b);
  });

  /* ---------- Kéo thả file ---------- */
  function dropZone(el, onFile) {
    ['dragenter', 'dragover'].forEach(function (t) { el.addEventListener(t, function (e) { e.preventDefault(); el.classList.add('is-drag'); }); });
    ['dragleave', 'drop'].forEach(function (t) { el.addEventListener(t, function () { el.classList.remove('is-drag'); }); });
    el.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
  }

  /* ---------- Mã động (giao tiếp với codes.js) ---------- */
  function enterDyn(code) {
    if (!S.dyn) S.staticDesign = S.design;
    S.dyn = { id: code.id, slug: code.slug, name: code.name, shortUrl: code.shortUrl, target: code.target };
    if (code.design) S.design = R.normalize(code.design);
    $('dynBanner').hidden = false;
    $('dynName').textContent = '"' + code.name + '"';
    $('dynShort').textContent = code.shortUrl.replace(/^https?:\/\//, '');
    $('dynShort').href = code.shortUrl;
    $('types').hidden = true;
    form.elements.dynTarget.value = code.target;
    $('dynSaveTarget').disabled = true;
    $('dynSaveCard').hidden = false;
    syncDesignUI();
    setType(S.type);
    $('maker').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exitDyn() {
    S.dyn = null;
    S.design = S.staticDesign || S.design;
    $('dynBanner').hidden = true;
    $('types').hidden = false;
    $('dynSaveCard').hidden = true;
    syncDesignUI();
    setType(S.type);
  }

  // Bấm "Tạo mã động" khi đang nhập đường dẫn
  function makeDyn() {
    if (!window.QRCodes) return;
    var target = S.type === 'url' ? P.url(S.fields.url) : '';
    window.QRCodes.startCreate({ target: target && P.isUrl(target) ? target : '', design: S.design });
  }

  $('dynExit').addEventListener('click', exitDyn);
  $('makeDyn').addEventListener('click', makeDyn);
  form.querySelector('[data-act="make-dyn"]').addEventListener('click', makeDyn);
  $('dynSaveTarget').addEventListener('click', function () {
    if (!S.dyn) return;
    var btn = this;
    btn.disabled = true;
    window.QRCodes.update(S.dyn.id, { target: form.elements.dynTarget.value }).then(function (c) {
      S.dyn.target = c.target;
      form.elements.dynTarget.value = c.target;
      toast('Đã đổi đích. Mã đã in sẽ dẫn tới đường dẫn mới ngay.');
    }, function (e) { btn.disabled = false; toast(e.message); });
  });
  $('dynSaveDesign').addEventListener('click', function () {
    if (!S.dyn) return;
    window.QRCodes.update(S.dyn.id, { design: S.design }).then(function () { toast('Đã lưu thiết kế cho mã ' + S.dyn.name); }, function (e) { toast(e.message); });
  });
  $('dynStats').addEventListener('click', function () { if (S.dyn) window.QRCodes.openStats(S.dyn.id); });

  /* ---------- Tạo hàng loạt ---------- */
  function bulkItems() {
    var used = {};
    return $('bulkInput').value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).map(function (line, i) {
      var name = '', text = line;
      // "tên, nội dung": chỉ tách khi phần đầu không giống đường dẫn
      var m = /^([^,;\t:/]{1,60})[,;\t]\s*(.+)$/.exec(line);
      if (m) { name = m[1].trim(); text = m[2].trim(); }
      if (!/\s/.test(text) && !/^[a-z][a-z0-9+.-]*:/i.test(text) && P.isUrl(text)) text = P.url(text);
      var base = name ? slug(name, 50) : (i + 1) + '-' + slug(text, 44), file = base, n = 2;
      while (used[file]) file = base + '-' + n++;
      used[file] = 1;
      return { name: file, text: text };
    });
  }
  function bulkCount() {
    var n = bulkItems().length;
    $('bulkCount').textContent = n + ' mã' + (n > 500 ? ' · tối đa 500 mã mỗi lần' : '');
  }
  $('bulkInput').addEventListener('input', debounce(bulkCount, 200));
  $('bulkFile').addEventListener('click', function () { $('bulkInputFile').click(); });
  $('bulkInputFile').addEventListener('change', function () {
    var f = this.files[0];
    this.value = '';
    if (!f) return;
    f.text().then(function (t) { $('bulkInput').value = t.replace(/^\ufeff/, ''); bulkCount(); });
  });
  dropZone($('bulkInput'), function (f) { f.text().then(function (t) { $('bulkInput').value = t.replace(/^\ufeff/, ''); bulkCount(); }); });

  $('bulkGo').addEventListener('click', function () {
    var items = bulkItems();
    if (!items.length) { toast('Nhập mỗi dòng một nội dung trước đã'); $('bulkInput').focus(); return; }
    if (items.length > 500) { toast('Mỗi lần tạo tối đa 500 mã'); return; }
    var fmt = $('bulkFormat').value, size = dlSize(), design = S.design;
    var files = [], bad = 0, i = 0, btn = this;
    btn.disabled = true;
    $('bulkProgress').hidden = false;
    function step() {
      if (i >= items.length) {
        if (files.length) saveBlob(new Blob([Z.zip(files)], { type: 'application/zip' }), 'ma-qr-hang-loat.zip');
        toast(files.length ? 'Đã tạo ' + (items.length - bad) + ' mã' + (bad ? ', bỏ qua ' + bad + ' dòng quá dài' : '') : 'Không tạo được mã nào');
        btn.disabled = false;
        $('bulkProgress').hidden = true;
        return;
      }
      var it = items[i++];
      $('bulkBar').style.width = Math.round(i / items.length * 100) + '%';
      var qr;
      try { qr = encode(it.text, design); } catch (e) { bad++; return step(); }
      if (fmt !== 'png') files.push({ name: it.name + '.svg', data: R.svg(qr, design, { size: 1024, title: it.text.slice(0, 200) }).svg });
      if (fmt === 'svg') return setTimeout(step, 0);
      rasterize(it.text, design, size).then(function (b) { return b.arrayBuffer(); }).then(function (buf) {
        files.push({ name: it.name + '.png', data: new Uint8Array(buf) });
        step();
      }, function () { bad++; step(); });
    }
    step();
  });

  /* ---------- Đọc mã QR từ ảnh ---------- */
  function readImage(file) {
    if (!file || !/^image\//.test(file.type)) { toast('Hãy chọn file ảnh'); return; }
    var out = $('readerOut');
    out.hidden = false;
    out.className = 'reader-out';
    out.textContent = 'Đang đọc…';
    decodeBlob(file).then(function (r) {
      out.textContent = '';
      if (!r || !r.data) { out.classList.add('is-bad'); out.textContent = 'Không tìm thấy mã QR trong ảnh. Thử ảnh rõ hơn, chụp thẳng và đủ sáng.'; return; }
      showRead(r.data);
    }, function (e) { out.classList.add('is-bad'); out.textContent = e.message; });
  }

  function row(label, value) {
    var p = document.createElement('p');
    var b = document.createElement('b');
    b.textContent = label + ': ';
    p.appendChild(b);
    p.appendChild(document.createTextNode(value));
    return p;
  }

  function showRead(text) {
    var out = $('readerOut');
    var vq = P.readVietqr(text);
    var wifi = /^WIFI:/i.test(text) ? text : null;
    // Đọc 1 trường của mã Wi-Fi (S tên mạng, P mật khẩu, T bảo mật, H mạng ẩn), bỏ ký tự thoát \
    var wf = function (k) {
      var m = wifi && new RegExp('[:;]' + k + ':((?:\\\\.|[^;])*)').exec(wifi);
      return m ? m[1].replace(/\\(.)/g, '$1') : '';
    };
    var head = document.createElement('span');
    head.className = 'opt-title';
    out.appendChild(head);
    if (vq) {
      head.textContent = 'Mã chuyển khoản VietQR';
      out.appendChild(row('Ngân hàng', vq.bank || vq.bin));
      out.appendChild(row('Số tài khoản', vq.account));
      if (vq.amount) out.appendChild(row('Số tiền', vq.amount.toLocaleString('vi-VN') + 'đ'));
      if (vq.info) out.appendChild(row('Nội dung', vq.info));
    } else if (wifi) {
      head.textContent = 'Mã Wi-Fi';
      out.appendChild(row('Tên mạng', wf('S')));
      if (wf('P')) out.appendChild(row('Mật khẩu', wf('P')));
    } else if (/^https?:\/\//i.test(text)) {
      head.textContent = 'Đường dẫn';
      var a = document.createElement('a');
      a.href = text;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.textContent = text;
      a.className = 'reader-link';
      out.appendChild(a);
      var host = '';
      try { host = new URL(text).hostname; } catch (e) { /* bỏ qua */ }
      out.appendChild(row('Tên miền', host));
    } else {
      head.textContent = 'Nội dung';
      var pre = document.createElement('p');
      pre.className = 'reader-text';
      pre.textContent = text;
      out.appendChild(pre);
    }
    var actions = document.createElement('div');
    actions.className = 'reader-actions';
    var c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.innerHTML = '<svg class="ic"><use href="#i-copy"/></svg>Chép nội dung';
    c.addEventListener('click', function () { copy(text).then(function () { toast('Đã chép nội dung mã'); }); });
    var u = document.createElement('button');
    u.type = 'button';
    u.className = 'chip';
    u.innerHTML = '<svg class="ic"><use href="#i-pencil"/></svg>Tạo lại mã này';
    u.addEventListener('click', function () {
      if (S.dyn) exitDyn();
      // Điền đúng form theo loại mã vừa đọc
      if (vq) { Object.assign(S.fields, { bin: vq.bin, account: vq.account, amount: vq.amount ? String(vq.amount) : '', info: vq.info }); setType('bank'); }
      else if (wifi) { Object.assign(S.fields, { ssid: wf('S'), password: wf('P'), auth: wf('T') || 'WPA', hidden: wf('H') === 'true' }); setType('wifi'); }
      else if (/^https?:\/\//i.test(text)) { S.fields.url = text; setType('url'); }
      else { S.fields.text = text; setType('text'); }
      writeFields();
      persist();
      $('maker').scrollIntoView({ behavior: 'smooth' });
    });
    actions.appendChild(c);
    actions.appendChild(u);
    // Mã động của chính ManhTool: cho người quét báo cáo nếu nó dẫn tới trang lừa đảo
    var cfg = window.QRAccount && window.QRAccount.state().cfg;
    if (cfg && cfg.shortBase && text.toLowerCase().indexOf(cfg.shortBase.toLowerCase()) === 0) {
      var rp = document.createElement('a');
      rp.className = 'chip';
      rp.href = 'dieu-khoan.html?ma=' + encodeURIComponent(text) + '#bao-cao';
      rp.innerHTML = '<svg class="ic"><use href="#i-flag"/></svg>Báo cáo mã này';
      actions.appendChild(rp);
    }
    out.appendChild(actions);
  }

  $('readerDrop').addEventListener('click', function () { $('readerInput').click(); });
  $('readerDrop').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('readerInput').click(); } });
  $('readerInput').addEventListener('change', function () { readImage(this.files[0]); this.value = ''; });
  dropZone($('readerDrop'), readImage);
  // Dán ảnh (Ctrl+V) ở bất kỳ đâu ngoài ô nhập → đọc mã
  document.addEventListener('paste', function (e) {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    var item = Array.prototype.find.call((e.clipboardData && e.clipboardData.items) || [], function (x) { return x.type.indexOf('image/') === 0; });
    if (item) { e.preventDefault(); readImage(item.getAsFile()); }
  });

  /* ---------- Khối chung ManhTool ---------- */
  $('themeToggle').addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem(KEY.theme, dark ? 'light' : 'dark'); } catch (e) { /* bỏ qua */ }
  });
  $('qrOpen').addEventListener('click', function () { $('qrDialog').showModal(); });
  $('qrDialog').addEventListener('click', function (e) { if (e.target === this) this.close(); });
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      copy(b.dataset.copy).then(function () { toast('Đã chép số ' + b.dataset.copy); }, function () { toast('Không chép được, số: ' + b.dataset.copy); });
    });
  });
  // Lời mời hợp tác: hiện 1 lần mỗi 7 ngày, sau 45 giây dùng trang (chỉ máy tính)
  (function () {
    var last = Number(load(KEY.nudge)) || 0;
    if (Date.now() - last < 7 * 86400000) return;
    setTimeout(function () { if (!document.querySelector('dialog[open]')) $('nudge').hidden = false; }, 45000);
    $('nudgeClose').addEventListener('click', function () { $('nudge').hidden = true; store(KEY.nudge, Date.now()); });
  })();

  /* ---------- Khởi động ---------- */
  fillBanks();
  writeFields();
  renderPresets();
  renderThumbs();
  syncDesignUI();
  setType(S.type);
  bulkCount();
  // Chạy được khi mất mạng (chỉ phần mã tĩnh); service worker cần https hoặc localhost
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  window.QRApp = {
    toast: toast, copy: copy, svgFor: svgFor, rasterize: rasterize, saveBlob: saveBlob, slug: slug,
    enterDyn: enterDyn, exitDyn: exitDyn, design: function () { return S.design; },
    presets: PRESETS, // scripts/scan-matrix.js thử quét từng mẫu
    dynId: function () { return S.dyn && S.dyn.id; }
  };
})();
