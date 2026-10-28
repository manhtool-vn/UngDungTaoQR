/* ManhTool — Tạo mã QR: quản lý mã QR động (danh sách, tạo / sửa, bật / tắt, thống kê lượt quét).
   Mã động chỉ chứa đường dẫn ngắn …/q/<tên>; đích đến và thống kê nằm trên máy chủ. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY_INTENT = 'mt-qr-intent'; // nhớ việc định làm khi phải đi đăng nhập
  var STATE = {
    active: ['Đang chạy', 'is-on'], off: ['Đã tắt', ''], quota: ['Tạm dừng · vượt hạn mức gói', 'is-warn'],
    expired: ['Hết hạn', 'is-warn'], limit: ['Đủ lượt quét', 'is-warn'], blocked: ['Bị khóa', 'is-bad']
  };
  var OS_NAMES = { mobile: 'Điện thoại', tablet: 'Máy tính bảng', desktop: 'Máy tính' };

  var st = { codes: [], quota: null, loaded: false, editing: null, statsId: null, statsDays: 30 };

  function api(m, p, b) { return window.MTApi.request(m, p, b); }
  function acc() { return window.QRAccount.state(); }
  function toast(m, l, f) { window.QRApp.toast(m, l, f); }
  function num(n) { return (Number(n) || 0).toLocaleString('vi-VN'); }
  function money(n) { return num(n) + 'đ'; }
  function when(ms) {
    if (!ms) return 'chưa có';
    var d = new Date(ms), diff = Date.now() - ms;
    if (diff < 60000) return 'vừa xong';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' phút trước';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' giờ trước';
    return d.toLocaleDateString('vi-VN') + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function save(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }
  function read(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function err(r) { return new Error((r.data && r.data.error) || 'Có lỗi, vui lòng thử lại'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(name) { return '<svg class="ic"><use href="#i-' + name + '"/></svg>'; }

  /* ---------- Khung giới thiệu / danh sách ---------- */
  function render() {
    var a = acc(), cfg = a.cfg, user = a.user;
    var shop = cfg && cfg.shop;
    $('planFreeDyn').textContent = (cfg ? cfg.freeLimit : 3) + ' mã động';
    $('planProDyn').textContent = (cfg ? num(cfg.proLimit) : '100') + ' mã động';
    var free = window.MTPromo && cfg ? window.MTPromo.freeOn(cfg.free) : null;
    if (shop && free) {
      // Đang mở miễn phí: giá gốc gạch ngang
      $('planProPrice').innerHTML = '<s>' + money(shop.month.price) + '</s> 0đ';
      $('planYear').textContent = 'Đang mở miễn phí' + (free.endsAt ? ' đến ' + new Date(free.endsAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }) : '') + ' — đăng nhập là dùng được ngay';
    } else if (shop) {
      $('planProPrice').textContent = money(shop.month.price);
      $('planYear').textContent = 'Hoặc ' + money(shop.year.price) + ' cho 12 tháng (tiết kiệm ' + Math.max(0, Math.round((1 - shop.year.price / (shop.month.price * 12)) * 100)) + '%)';
    }
    $('codesPitch').hidden = !!user;
    $('codesApp').hidden = !user;
    $('newCode').hidden = !user;
    var note = $('pitchNote'), btn = $('pitchLogin');
    if (!cfg) {
      btn.hidden = true;
      note.textContent = 'Mã động cần máy chủ ManhTool để chuyển hướng và đếm lượt quét. Bản bạn đang mở chỉ có phần tạo mã tĩnh.';
    } else if (!user) {
      btn.hidden = !cfg.googleLogin;
      note.textContent = cfg.googleLogin ? 'Dùng thử miễn phí, không cần thẻ.' : 'Đăng nhập đang tạm tắt, vui lòng quay lại sau.';
    }
    if (user) {
      // Vừa mua / hết Pro → hạn mức đổi, tải lại danh sách
      if (!st.loaded || (st.quota && st.quota.pro !== !!user.pro)) load();
      else renderList();
    }
  }

  function load() {
    return api('GET', '/codes').then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không tải được danh sách mã'); return; }
      st.codes = r.data.codes;
      st.quota = r.data.quota;
      st.loaded = true;
      renderList();
    });
  }

  function renderQuota() {
    var q = st.quota, box = $('quota');
    if (!q) return;
    var pct = q.limit ? Math.min(100, Math.round(q.used / q.limit * 100)) : 100;
    box.innerHTML = '<div class="quota-text"><span></span><button type="button" class="link-btn" data-buy></button></div><div class="quota-bar"><span></span></div>';
    box.querySelector('span').textContent = 'Đang bật ' + q.used + '/' + q.limit + ' mã động' + (q.pro ? ' · Pro đến ' + new Date(q.proUntil || Date.now()).toLocaleDateString('vi-VN') : ' · Gói miễn phí');
    var buy = box.querySelector('[data-buy]');
    var canBuy = !!(acc().cfg && acc().cfg.shop && acc().cfg.shop.enabled);
    buy.hidden = !canBuy;
    buy.textContent = q.pro ? 'Gia hạn' : 'Nâng cấp Pro';
    box.querySelector('.quota-bar span').style.width = pct + '%';
    box.classList.toggle('is-full', q.used >= q.limit);
  }

  function renderFolders() {
    var sel = $('folderFilter'), cur = sel.value;
    var folders = Array.from(new Set(st.codes.map(function (c) { return c.folder; }).filter(Boolean))).sort();
    sel.textContent = '';
    sel.appendChild(new Option('Mọi thư mục', ''));
    folders.forEach(function (f) { sel.appendChild(new Option(f, f)); });
    sel.value = folders.indexOf(cur) >= 0 ? cur : '';
    sel.hidden = !folders.length;
    var dl = $('folderList');
    dl.textContent = '';
    folders.forEach(function (f) { dl.appendChild(new Option(f)); });
  }

  function renderList() {
    renderQuota();
    renderFolders();
    var q = $('codeSearch').value.trim().toLowerCase(), folder = $('folderFilter').value;
    var list = st.codes.filter(function (c) {
      return (!folder || c.folder === folder) && (!q || [c.name, c.target, c.slug, c.folder].some(function (v) { return String(v).toLowerCase().indexOf(q) >= 0; }));
    });
    var ul = $('codeList');
    ul.textContent = '';
    list.forEach(function (c) { ul.appendChild(item(c)); });
    $('codesEmpty').hidden = st.codes.length > 0;
    if (st.codes.length && !list.length) {
      var li = el('li', 'codes-none', 'Không có mã nào khớp.');
      ul.appendChild(li);
    }
  }

  function item(c) {
    var li = el('li', 'code-item');
    li.dataset.state = c.state;
    var thumb = el('button', 'ci-thumb');
    thumb.type = 'button';
    thumb.title = 'Thiết kế và tải ảnh mã này';
    try { thumb.innerHTML = window.QRApp.svgFor(c.shortUrl, Object.assign({}, c.design || {}, { label: 'none', margin: 1 }), 64).svg; } catch (e) { /* bỏ qua */ }
    thumb.addEventListener('click', function () { design(c.id); });

    var main = el('div', 'ci-main');
    var top = el('div', 'ci-top');
    top.appendChild(el('b', 'ci-name', c.name));
    if (c.folder) top.appendChild(el('span', 'ci-folder', c.folder));
    var s = STATE[c.state] || STATE.off;
    top.appendChild(el('span', 'ci-state ' + s[1], s[0]));
    if (c.hasPassword) { var lk = el('span', 'ci-flag'); lk.innerHTML = icon('lock'); lk.title = 'Có mật khẩu'; top.appendChild(lk); }
    main.appendChild(top);
    var links = el('div', 'ci-links');
    var a = el('a', 'ci-short', c.shortUrl.replace(/^https?:\/\//, ''));
    a.href = c.shortUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    links.appendChild(a);
    var cp = el('button', 'copy-mini');
    cp.type = 'button';
    cp.innerHTML = icon('copy');
    cp.setAttribute('aria-label', 'Chép đường dẫn ngắn');
    cp.addEventListener('click', function () {
      window.QRApp.copy(c.shortUrl).then(function () { cp.classList.add('is-done'); setTimeout(function () { cp.classList.remove('is-done'); }, 1200); toast('Đã chép ' + c.shortUrl); });
    });
    links.appendChild(cp);
    main.appendChild(links);
    var tg = el('p', 'ci-target');
    tg.innerHTML = icon('arrow-right');
    tg.appendChild(document.createTextNode(c.target));
    tg.title = c.target;
    main.appendChild(tg);

    var stats = el('button', 'ci-stats');
    stats.type = 'button';
    stats.title = 'Xem thống kê';
    var spark = el('span', 'spark');
    var max = Math.max.apply(null, c.spark.concat([1]));
    c.spark.forEach(function (n) { var b = el('i'); b.style.height = Math.max(6, Math.round(n / max * 100)) + '%'; if (!n) b.className = 'is-zero'; spark.appendChild(b); });
    stats.appendChild(spark);
    var tot = el('span', 'ci-total');
    tot.innerHTML = '<b></b><small></small>';
    tot.firstChild.textContent = num(c.total);
    tot.lastChild.textContent = 'lượt quét';
    stats.appendChild(tot);
    stats.addEventListener('click', function () { openStats(c.id); });

    var actions = el('div', 'ci-actions');
    var btnD = el('button', 'chip');
    btnD.type = 'button';
    btnD.innerHTML = icon('download') + '<span>Tải ảnh</span>';
    btnD.addEventListener('click', function () { design(c.id); });
    var btnE = el('button', 'icon-btn');
    btnE.type = 'button';
    btnE.innerHTML = icon('pencil');
    btnE.title = 'Sửa đích đến, tên, tùy chọn';
    btnE.setAttribute('aria-label', 'Sửa mã ' + c.name);
    btnE.addEventListener('click', function () { openEdit(c.id); });
    var sw = el('label', 'opt ci-switch');
    sw.title = c.active ? 'Tắt mã' : 'Bật mã';
    sw.innerHTML = '<input type="checkbox"><span class="switch" aria-hidden="true"></span>';
    var cb = sw.firstChild;
    cb.checked = c.active;
    cb.disabled = c.blocked;
    cb.setAttribute('aria-label', (c.active ? 'Tắt' : 'Bật') + ' mã ' + c.name);
    cb.addEventListener('change', function () {
      update(c.id, { active: cb.checked }).then(function (x) {
        toast(x.active ? 'Đã bật mã ' + x.name : 'Đã tắt mã ' + x.name + '. Người quét sẽ thấy trang thông báo tạm dừng.');
      }, function (e) { cb.checked = !cb.checked; toast(e.message); });
    });
    var btnX = el('button', 'icon-btn ci-del');
    btnX.type = 'button';
    btnX.innerHTML = icon('trash');
    btnX.title = 'Xóa mã';
    btnX.setAttribute('aria-label', 'Xóa mã ' + c.name);
    btnX.addEventListener('click', function () { remove(c); });
    actions.appendChild(btnD);
    actions.appendChild(btnE);
    actions.appendChild(sw);
    actions.appendChild(btnX);

    li.appendChild(thumb);
    li.appendChild(main);
    li.appendChild(stats);
    li.appendChild(actions);
    return li;
  }

  function find(id) { return st.codes.filter(function (c) { return c.id === id; })[0]; }

  function upsert(c, quota) {
    var i = st.codes.findIndex(function (x) { return x.id === c.id; });
    var lite = Object.assign({}, c);
    if (i >= 0) st.codes[i] = Object.assign(st.codes[i], lite); else st.codes.unshift(lite);
    if (quota) st.quota = quota;
    renderList();
  }

  /* ---------- Thao tác ---------- */
  function create(body) {
    return api('POST', '/codes', body).then(function (r) {
      if (!r.ok) throw err(r);
      upsert(r.data.code, r.data.quota);
      window.QRAccount.refresh();
      return r.data.code;
    });
  }

  function update(id, patch) {
    return api('PATCH', '/codes/' + id, patch).then(function (r) {
      if (!r.ok) throw err(r);
      upsert(r.data.code, r.data.quota);
      return r.data.code;
    });
  }

  function remove(c) {
    if (!window.confirm('Xóa mã "' + c.name + '"?\n\nMã đã in sẽ không còn dẫn tới đâu, thống kê cũng bị xóa. Nếu chỉ muốn tạm ngừng, hãy tắt mã thay vì xóa.')) return;
    api('DELETE', '/codes/' + c.id).then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không xóa được mã'); return; }
      st.codes = st.codes.filter(function (x) { return x.id !== c.id; });
      st.quota = r.data.quota;
      if (window.QRApp.dynId() === c.id) window.QRApp.exitDyn();
      renderList();
      window.QRAccount.refresh();
      toast('Đã xóa mã ' + c.name);
    });
  }

  // Mở mã trong khung thiết kế phía trên để tải ảnh
  function design(id) {
    api('GET', '/codes/' + id).then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không mở được mã'); return; }
      window.QRApp.enterDyn(r.data.code);
    });
  }

  function needLogin(intent) {
    var a = acc();
    if (!a.cfg) { toast('Mã động cần máy chủ ManhTool. Bản bạn đang mở chỉ tạo được mã tĩnh.'); return true; }
    if (!a.user) {
      save(KEY_INTENT, intent);
      toast('Đăng nhập Google để tạo mã động', 'Đăng nhập', function () { window.QRAccount.login(); });
      return true;
    }
    return false;
  }

  // Từ khung tạo mã: có đường dẫn hợp lệ thì tạo luôn, chưa có thì mở hộp nhập
  function startCreate(o) {
    if (needLogin({ action: 'create', target: o.target, design: o.design })) return;
    if (!o.target) { openNew({ design: o.design }); return; }
    var host = '';
    try { host = new URL(o.target).hostname.replace(/^www\./, ''); } catch (e) { /* bỏ qua */ }
    create({ target: o.target, name: host, design: o.design }).then(function (c) {
      window.QRApp.enterDyn(c);
      toast('Đã tạo mã động ' + c.shortUrl.replace(/^https?:\/\//, '') + '. Tải ảnh về để in.');
    }, function (e) {
      if (/Pro|hạn mức|dùng được/.test(e.message) && window.QRShop && window.QRShop.available()) toast(e.message, 'Xem gói Pro', function () { window.QRShop.open(); });
      else toast(e.message);
    });
  }

  /* ---------- Hộp tạo / sửa ---------- */
  var dlg = $('codeDialog'), form = $('codeForm');
  var pwClear = false;

  function dayInput(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fillDialog(c, preset) {
    var a = acc(), pro = !!(a.user && a.user.pro);
    st.editing = c ? c.id : null;
    pwClear = false;
    form.reset();
    $('codeDlgTitle').textContent = c ? 'Sửa mã động' : 'Tạo mã QR động';
    $('codeSubmit').lastElementChild.textContent = c ? 'Lưu' : 'Tạo mã';
    $('slugBase').textContent = (a.cfg ? a.cfg.shortBase : '').replace(/^https?:\/\//, '');
    form.elements.target.value = c ? c.target : (preset && preset.target) || '';
    form.elements.name.value = c ? c.name : '';
    form.elements.folder.value = c ? c.folder : '';
    form.elements.iosUrl.value = c ? c.iosUrl : '';
    form.elements.androidUrl.value = c ? c.androidUrl : '';
    form.elements.slug.value = c ? c.slug : '';
    form.elements.slug.placeholder = c ? c.slug : 'tự đặt nếu để trống';
    form.elements.expiresAt.value = c ? dayInput(c.expiresAt) : '';
    form.elements.scanLimit.value = c && c.scanLimit ? c.scanLimit : '';
    $('pwNote').hidden = !(c && c.hasPassword);
    form.elements.password.placeholder = c && c.hasPassword ? 'Giữ mật khẩu cũ' : 'Để trống nếu không cần';
    $('codeDevice').open = !!(c && (c.iosUrl || c.androidUrl));
    $('codePro').open = !!(c && (c.expiresAt || c.scanLimit || c.hasPassword));
    ['slug', 'expiresAt', 'scanLimit', 'password'].forEach(function (k) { form.elements[k].disabled = !pro; });
    $('proLock').hidden = pro;
    $('proLockBuy').hidden = !(window.QRShop && window.QRShop.available());
    var hist = c && c.history ? c.history : [];
    $('codeHistory').hidden = !hist.length;
    var ul = $('codeHistoryList');
    ul.textContent = '';
    hist.forEach(function (h) {
      var li = el('li');
      li.appendChild(el('time', '', when(h.at)));
      li.appendChild(el('span', 'ch-url', h.target));
      var b = el('button', 'link-btn', 'Dùng lại');
      b.type = 'button';
      b.addEventListener('click', function () { form.elements.target.value = h.target; form.elements.target.focus(); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    $('codeError').hidden = true;
    st.newDesign = preset && preset.design;
  }

  function openNew(preset) {
    if (needLogin({ action: 'new' })) return;
    fillDialog(null, preset);
    dlg.showModal();
    form.elements.target.focus();
  }

  function openEdit(id) {
    api('GET', '/codes/' + id).then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không mở được mã'); return; }
      fillDialog(r.data.code);
      dlg.showModal();
    });
  }

  function showError(msg) { $('codeError').textContent = msg; $('codeError').hidden = false; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements, pro = !!(acc().user && acc().user.pro);
    var c = st.editing && find(st.editing);
    var body = { target: f.target.value.trim(), name: f.name.value.trim(), folder: f.folder.value.trim(), iosUrl: f.iosUrl.value.trim(), androidUrl: f.androidUrl.value.trim() };
    if (!body.target) { showError('Vui lòng nhập đường dẫn đích'); f.target.focus(); return; }
    if (pro) {
      var slug = f.slug.value.trim().toLowerCase();
      if (slug && (!c || slug !== c.slug)) body.slug = slug;
      body.expiresAt = f.expiresAt.value ? new Date(f.expiresAt.value + 'T23:59:59').getTime() : null;
      body.scanLimit = Number(f.scanLimit.value) || 0;
      if (f.password.value) body.password = f.password.value;
    }
    if (pwClear) body.password = '';
    if (!c && !body.name) delete body.name;
    $('codeSubmit').disabled = true;
    var job = c ? update(c.id, body) : create(Object.assign(body, { design: st.newDesign || window.QRApp.design() }));
    job.then(function (code) {
      $('codeSubmit').disabled = false;
      dlg.close();
      if (!c) { window.QRApp.enterDyn(code); toast('Đã tạo mã động. Tải ảnh về để in.'); }
      else {
        toast('Đã lưu mã ' + code.name);
        if (window.QRApp.dynId() === code.id) window.QRApp.enterDyn(code);
      }
    }, function (e2) { $('codeSubmit').disabled = false; showError(e2.message); });
  });

  $('codeClose').addEventListener('click', function () { dlg.close(); });
  $('codeCancel').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('pwClear').addEventListener('click', function () { pwClear = true; $('pwNote').textContent = 'Mật khẩu sẽ được bỏ khi bấm Lưu.'; });
  $('proLockBuy').addEventListener('click', function () { dlg.close(); window.QRShop.open(); });

  /* ---------- Thống kê ---------- */
  var sdlg = $('statsDialog');

  function openStats(id) {
    var c = find(id);
    st.statsId = id;
    $('statsTitle').textContent = c ? c.name : 'Thống kê';
    $('statsLink').textContent = c ? c.shortUrl.replace(/^https?:\/\//, '') : '';
    $('statsLink').href = c ? c.shortUrl : '#';
    if (!sdlg.open) sdlg.showModal();
    loadStats();
  }

  function loadStats() {
    var days = st.statsDays;
    $('statsRange').querySelectorAll('[data-days]').forEach(function (b) { b.setAttribute('aria-checked', Number(b.dataset.days) === days ? 'true' : 'false'); });
    var pro = !!(acc().user && acc().user.pro);
    $('statsCsv').classList.toggle('is-locked', !pro);
    $('statsCsv').href = '/api/codes/' + st.statsId + '/export.csv';
    api('GET', '/codes/' + st.statsId + '/stats?days=' + days).then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không tải được thống kê'); return; }
      renderStats(r.data.stats);
    });
  }

  function renderStats(s) {
    $('statsLimit').hidden = s.days >= st.statsDays;
    var tiles = $('statsTiles');
    tiles.textContent = '';
    [[num(s.total), 'Tổng lượt quét'], [num(s.unique), 'Người quét (không trùng trong ngày)'], [num(s.inRange), 'Trong ' + s.days + ' ngày'], [when(s.last), 'Lần quét gần nhất']].forEach(function (t) {
      var d = el('div', 'stat-tile');
      d.appendChild(el('b', '', t[0]));
      d.appendChild(el('span', '', t[1]));
      tiles.appendChild(d);
    });

    // Cột theo ngày; khoảng dài gộp theo tuần cho dễ nhìn
    var series = s.series, step = series.length > 120 ? 7 : 1, bars = [];
    for (var i = 0; i < series.length; i += step) {
      var chunk = series.slice(i, i + step);
      bars.push({ date: chunk[0].date, end: chunk[chunk.length - 1].date, n: chunk.reduce(function (a, d) { return a + d.n; }, 0), u: chunk.reduce(function (a, d) { return a + d.u; }, 0) });
    }
    var chart = $('statsChart');
    chart.textContent = '';
    chart.style.setProperty('--cols', bars.length);
    var max = Math.max.apply(null, bars.map(function (b) { return b.n; }).concat([1]));
    var fmt = function (iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; };
    bars.forEach(function (b, i) {
      var col = el('div', 'chart-col');
      col.tabIndex = 0;
      var bar = el('span', 'chart-bar');
      bar.style.height = (b.n ? Math.max(3, b.n / max * 100) : 0) + '%';
      col.appendChild(bar);
      var tip = el('span', 'chart-tip');
      tip.appendChild(el('b', '', step > 1 ? fmt(b.date) + ' – ' + fmt(b.end) : fmt(b.date)));
      tip.appendChild(document.createTextNode(num(b.n) + ' lượt · ' + num(b.u) + ' người'));
      col.appendChild(tip);
      // Nhãn ngày thưa để không chồng chữ; luôn có nhãn cột cuối, bỏ nhãn đều đặn nằm sát nó
      var every = Math.ceil(bars.length / 8), last = bars.length - 1;
      if (i === last || (i % every === 0 && last - i >= every / 2)) col.appendChild(el('span', 'chart-lbl', fmt(b.date)));
      chart.appendChild(col);
    });
    chart.setAttribute('aria-label', 'Biểu đồ lượt quét ' + s.days + ' ngày, tổng ' + s.inRange + ' lượt');

    function breakdown(id, list, names) {
      var ul = $(id), total = list.reduce(function (a, x) { return a + x.v; }, 0);
      ul.textContent = '';
      if (!total) { ul.appendChild(el('li', 'bd-empty', 'Chưa có dữ liệu')); return; }
      list.slice(0, 6).forEach(function (x) {
        var li = el('li');
        var pct = Math.round(x.v / total * 100);
        li.appendChild(el('span', 'bd-name', (names && names[x.k]) || x.k));
        li.appendChild(el('span', 'bd-val', pct + '%'));
        var bar = el('span', 'bd-bar');
        var fill = el('i');
        fill.style.width = pct + '%';
        bar.appendChild(fill);
        li.appendChild(bar);
        li.title = num(x.v) + ' lượt';
        ul.appendChild(li);
      });
    }
    breakdown('bdOs', s.os);
    breakdown('bdBr', s.br);
    breakdown('bdDev', s.dev, OS_NAMES);
    breakdown('bdCc', s.cc);
    $('bdCcBox').hidden = !s.cc.length;

    var hg = $('hourGrid'), hmax = Math.max.apply(null, s.hours.concat([1]));
    hg.textContent = '';
    s.hours.forEach(function (n, h) {
      var cell = el('span', 'hour');
      cell.style.setProperty('--a', n ? (0.15 + 0.85 * n / hmax).toFixed(2) : 0);
      cell.title = h + 'h–' + (h + 1) + 'h: ' + num(n) + ' lượt';
      if (h % 3 === 0) cell.appendChild(el('small', '', h + 'h'));
      hg.appendChild(cell);
    });

    var rl = $('recentList');
    rl.textContent = '';
    if (!s.recent.length) rl.appendChild(el('li', 'bd-empty', 'Chưa có lượt quét nào. Thử quét mã bằng điện thoại xem sao.'));
    s.recent.slice(0, 15).forEach(function (x) {
      var li = el('li');
      li.appendChild(el('time', '', when(x.at)));
      li.appendChild(el('span', '', [x.os, x.br, OS_NAMES[x.dev] || x.dev, x.cc].filter(Boolean).join(' · ')));
      rl.appendChild(li);
    });
  }

  $('statsRange').addEventListener('click', function (e) {
    var b = e.target.closest('[data-days]');
    if (!b) return;
    st.statsDays = Number(b.dataset.days);
    loadStats();
  });
  $('statsClose').addEventListener('click', function () { sdlg.close(); });
  sdlg.addEventListener('click', function (e) { if (e.target === sdlg) sdlg.close(); });
  $('statsCsv').addEventListener('click', function (e) {
    e.preventDefault();
    if (!(acc().user && acc().user.pro)) {
      if (window.QRShop && window.QRShop.available()) toast('Xuất CSV cần gói Pro', 'Xem gói Pro', function () { sdlg.close(); window.QRShop.open(); });
      else toast('Xuất CSV cần gói Pro');
      return;
    }
    var href = this.href;
    // Làm mới phiên trước (access token có thể đã hết hạn) rồi mới tải
    api('GET', '/me').then(function () { location.href = href; });
  });

  /* ---------- Sự kiện chung ---------- */
  $('newCode').addEventListener('click', function () { openNew(); });
  $('pitchLogin').addEventListener('click', function () { save(KEY_INTENT, { action: 'list' }); window.QRAccount.login(); });
  $('codeSearch').addEventListener('input', renderList);
  $('folderFilter').addEventListener('change', renderList);
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-buy]');
    if (b && window.QRShop) { if (sdlg.open) sdlg.close(); window.QRShop.open(); }
  });

  window.QRAccount.onChange(function (a) {
    render();
    // Vừa đăng nhập xong → làm tiếp việc đang dở
    var intent = read(KEY_INTENT);
    if (intent && a.user) {
      save(KEY_INTENT, null);
      setTimeout(function () {
        if (intent.action === 'create') startCreate({ target: intent.target, design: intent.design });
        else if (intent.action === 'new') openNew();
        else $('ma-dong').scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  });

  window.QRCodes = { startCreate: startCreate, update: update, openStats: openStats, openNew: openNew, reload: load };
})();
