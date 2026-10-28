/* ManhTool — Tạo mã QR: đăng nhập Google, hộp tài khoản, gói Pro.
   Chỉ hoạt động khi trang chạy cùng máy chủ (npm start). Mở file tĩnh thì phần tài khoản tự ẩn, tạo mã tĩnh vẫn dùng bình thường. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY_FLASH = 'mt-qr-flash';
  var st = { cfg: null, user: null, quota: null, sessions: 0, ready: false };
  var listeners = [];

  function api(method, path, body) { return window.MTApi.request(method, path, body); }
  function toast(msg, label, fn) { window.QRApp.toast(msg, label, fn); }
  function date(ms) { return new Date(ms).toLocaleDateString('vi-VN'); }
  function emit() { listeners.forEach(function (fn) { fn(st); }); }

  /* ---------- Giao diện ---------- */
  var dlg = $('accountDialog');

  function renderHeader() {
    var loginBtn = $('btnLogin'), accBtn = $('btnAccount');
    loginBtn.hidden = !(st.cfg && st.cfg.googleLogin && !st.user);
    accBtn.hidden = !st.user;
    if (!st.user) return;
    var img = accBtn.querySelector('img'), ini = accBtn.querySelector('.avatar-ini');
    if (st.user.picture) { img.src = st.user.picture; img.hidden = false; ini.hidden = true; }
    else { img.hidden = true; ini.hidden = false; ini.textContent = (st.user.name || st.user.email).charAt(0).toUpperCase(); }
    accBtn.title = st.user.name + ' (' + st.user.email + ')';
    accBtn.setAttribute('aria-label', 'Tài khoản: ' + st.user.name);
    accBtn.classList.toggle('is-pro', !!st.user.pro);
  }

  function renderDialog() {
    var u = st.user;
    var av = $('accAvatar');
    if (u.picture) { av.src = u.picture; av.hidden = false; } else av.hidden = true;
    $('accName').textContent = u.name;
    $('accEmail').textContent = u.email;
    var badges = $('accBadges');
    badges.textContent = '';
    [[u.pro ? 'Pro' : 'Gói miễn phí', u.pro ? 'is-pro' : ''],
      u.role === 'admin' ? ['Quản trị viên', 'is-admin'] : null,
      [st.sessions + ' thiết bị đang đăng nhập', '']].forEach(function (b) {
      if (!b) return;
      var s = document.createElement('span');
      s.className = 'acc-badge ' + b[1];
      s.textContent = b[0];
      badges.appendChild(s);
    });
    var q = st.quota || { used: 0, limit: u.codeLimit };
    var free = window.MTPromo && st.cfg ? window.MTPromo.freeOn(st.cfg.free) : null;
    if (u.pro && !u.paid && u.role !== 'admin') {
      // Pro nhờ chương trình mở miễn phí (đang chạy hoặc được giữ vĩnh viễn)
      var kept = (u.freeKeep || []).indexOf('pro') !== -1;
      $('accPlan').textContent = 'Gói Pro miễn phí';
      $('accPlanText').textContent = (kept ? 'Được giữ Pro vĩnh viễn từ chương trình miễn phí' : 'Đang mở miễn phí' + (free && free.endsAt ? ' đến ' + date(free.endsAt) : '')) + ' · Đang dùng ' + q.used + '/' + q.limit + ' mã động';
    } else if (u.pro) {
      $('accPlan').textContent = 'Gói Pro';
      $('accPlanText').textContent = (u.role === 'admin' && !u.proUntil ? 'Quản trị viên dùng đầy đủ tính năng' : 'Còn hạn đến ' + date(u.proUntil)) + ' · Đang dùng ' + q.used + '/' + q.limit + ' mã động';
    } else {
      $('accPlan').textContent = 'Gói miễn phí';
      $('accPlanText').textContent = 'Đang dùng ' + q.used + '/' + q.limit + ' mã động' + (u.proUntil ? ' · Pro đã hết hạn ngày ' + date(u.proUntil) : '');
    }
    var canBuy = !!(st.cfg && st.cfg.shop && st.cfg.shop.enabled);
    $('accUpgrade').hidden = !canBuy;
    $('accUpgrade').lastElementChild.textContent = u.paid ? 'Gia hạn' : 'Nâng cấp';
    $('accAdmin').hidden = u.role !== 'admin';
    $('accDelConfirm').checked = false;
    $('accDelete').disabled = true;
    $('accRename').hidden = true;
    $('accNameRow').hidden = false;
  }

  function openDialog() {
    renderDialog();
    if (dlg.showModal) dlg.showModal();
    refresh().then(function () { if (dlg.open && st.user) renderDialog(); });
  }

  function login() {
    if (!st.cfg || !st.cfg.googleLogin) { toast('Đăng nhập đang tạm tắt, vui lòng thử lại sau'); return; }
    location.href = '/api/auth/google/start?return=' + encodeURIComponent(location.pathname);
  }

  function logout(all) {
    api('POST', all ? '/auth/logout-all' : '/auth/logout').then(function () {
      try { sessionStorage.setItem(KEY_FLASH, 'Đã đăng xuất'); } catch (e) { /* bỏ qua */ }
      location.reload();
    });
  }

  /* ---------- Sự kiện ---------- */
  $('btnLogin').addEventListener('click', login);
  $('btnAccount').addEventListener('click', openDialog);
  $('accClose').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('accCodes').addEventListener('click', function () { dlg.close(); });
  // Tải dữ liệu: làm mới token trước (nếu đã hết hạn) rồi mới mở liên kết tải
  $('accExport').addEventListener('click', function (e) {
    e.preventDefault();
    api('GET', '/me').then(function (r) {
      if (r.ok && r.data.user) location.href = '/api/me/export';
      else toast('Phiên đăng nhập đã hết, vui lòng đăng nhập lại');
    });
  });
  $('accLogout').addEventListener('click', function () { logout(false); });
  $('accLogoutAll').addEventListener('click', function () { logout(true); });
  $('accUpgrade').addEventListener('click', function () { dlg.close(); if (window.QRShop) window.QRShop.open(); });
  $('accDelConfirm').addEventListener('change', function () { $('accDelete').disabled = !this.checked; });
  $('accDelete').addEventListener('click', function () {
    api('DELETE', '/me').then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không xóa được tài khoản'); return; }
      try { sessionStorage.setItem(KEY_FLASH, 'Đã xóa tài khoản và các mã động'); } catch (e) { /* bỏ qua */ }
      location.reload();
    });
  });
  $('accEditName').addEventListener('click', function () {
    $('accNameRow').hidden = true;
    $('accRename').hidden = false;
    $('accNameInput').value = st.user.name;
    $('accNameInput').focus();
    $('accNameInput').select();
  });
  $('accRename').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('accNameInput').value.trim();
    if (!name) return;
    api('PATCH', '/me', { name: name }).then(function (r) {
      if (!r.ok) { toast(r.data.error || 'Không đổi được tên'); return; }
      st.user = r.data.user;
      renderHeader();
      renderDialog();
    });
  });
  $('accRenameCancel').addEventListener('click', function () { $('accRename').hidden = true; $('accNameRow').hidden = false; });

  /* ---------- Khởi động ---------- */
  function flashFromUrl() {
    var q = new URLSearchParams(location.search);
    var err = q.get('login_error'), ok = q.get('login');
    if (!err && !ok) return false;
    q.delete('login_error');
    q.delete('login');
    var rest = q.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) { /* bỏ qua */ }
    if (err) toast(err);
    return ok === 'ok';
  }

  // Lấy lại hồ sơ + hạn mức (sau khi mua Pro, tạo / xóa mã…)
  function refresh() {
    if (!st.cfg) return Promise.resolve(null);
    return api('GET', '/me').then(function (r) {
      if (r.ok) {
        st.user = r.data.user || null;
        st.quota = r.data.quota || null;
        st.sessions = r.data.sessions || 0;
        renderHeader();
        emit();
      }
      return st.user;
    });
  }

  function init() {
    var justLoggedIn = flashFromUrl();
    var flash = null;
    try { flash = sessionStorage.getItem(KEY_FLASH); sessionStorage.removeItem(KEY_FLASH); } catch (e) { /* bỏ qua */ }
    if (flash) setTimeout(function () { toast(flash); }, 300);

    function done() { st.ready = true; renderHeader(); emit(); promoUi(); }
    if (location.protocol === 'file:') return done();
    api('GET', '/config').then(function (r) {
      if (!r.ok || typeof r.data.googleLogin !== 'boolean') return done(); // trang tĩnh, không có máy chủ
      st.cfg = r.data;
      document.body.classList.add('has-server');
      return api('GET', '/me').then(function (me) {
        if (me.ok && me.data.user) {
          st.user = me.data.user;
          st.quota = me.data.quota;
          st.sessions = me.data.sessions;
          if (justLoggedIn && !flash) toast('Xin chào ' + st.user.name + '!');
        }
        done();
      });
    }).catch(done);
  }

  /* ---------- Chương trình mở miễn phí & lời giới thiệu ManhTool (mt-promo.js) ---------- */
  var promoStarted = false;
  function goCodes() {
    var t = document.getElementById('ma-dong');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function announceOpts(f, force) {
    var u = st.user, cfg = st.cfg, canKeep = f.keep && cfg.googleLogin;
    return {
      force: force, title: 'Gói Pro đang miễn phí',
      text: 'Tạo mã QR động, đặt đường dẫn riêng, đặt mật khẩu và xem thống kê dài ngày — không cần thanh toán.',
      perks: [Number(cfg.proLimit || 100).toLocaleString('vi-VN') + ' mã QR động', 'Đường dẫn riêng …/q/ten-ban', 'Mật khẩu, hẹn ngày tắt mã', canKeep ? 'Đăng nhập là giữ vĩnh viễn' : 'Thống kê đến 400 ngày'],
      cta: !u && cfg.googleLogin ? { label: 'Đăng nhập để dùng Pro miễn phí', onClick: login } : { label: 'Tạo mã QR động ngay', onClick: goCodes },
      note: canKeep
        ? (u ? 'Tài khoản ' + u.email + ' đã được giữ Pro vĩnh viễn.' : 'Đăng nhập Google trong thời gian này để giữ Pro vĩnh viễn, kể cả khi chương trình kết thúc.')
        : 'Mã QR động tạo trong thời gian này vẫn chạy bình thường sau khi chương trình kết thúc.'
    };
  }
  function promoUi() {
    var P = window.MTPromo;
    if (!P || !st.cfg || promoStarted) return;
    promoStarted = true;
    var u = st.user, admin = !!(u && u.role === 'admin');
    var free = P.freeOn(st.cfg.free), brand = st.cfg.brand;
    if (free) {
      // Hết giờ khi đang mở trang → lấy lại cấu hình và hồ sơ (khoá lại tính năng Pro)
      P.bar(free, {
        text: 'Gói Pro đang miễn phí', onClick: function () { P.announce(free, brand, announceOpts(free, true)); },
        onEnd: function () { api('GET', '/config').then(function (r) { if (r.ok) st.cfg = r.data; return refresh(); }); }
      });
      // Quản trị viên không bị tự hiện (vẫn bấm dải xanh để xem)
      if (!admin) P.scheduleAnnounce(free, brand, announceOpts(free));
    }
    // Tài khoản đã trả tiền không thấy lời giới thiệu
    if (brand && !(u && u.paid)) {
      var kick = free ? 'Mở Pro miễn phí, đồng hành cùng' : 'Tạo mã QR miễn phí, đồng hành cùng';
      var host = document.querySelector('[data-mp-chip]');
      if (host) P.chip(brand, host, { label: 'Đồng hành cùng', kick: kick });
      if (!admin) P.schedule(brand, { kick: kick });
    }
  }

  window.QRAccount = {
    login: login, refresh: refresh,
    state: function () { return st; },
    // Gọi fn mỗi khi tài khoản / hạn mức đổi (và ngay lập tức nếu đã khởi động xong)
    onChange: function (fn) { listeners.push(fn); if (st.ready) fn(st); }
  };
  init();
})();
