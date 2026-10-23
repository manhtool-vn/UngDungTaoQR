/* ManhTool — Tạo mã QR: mua gói Pro bằng chuyển khoản VietQR.
   Chọn gói → máy chủ tạo đơn có mã riêng → quét QR → trang hỏi máy chủ mỗi 4 giây, tiền về là tự kích hoạt.
   Giá luôn do máy chủ quyết định; trang chỉ hiển thị. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY_INTENT = 'mt-qr-buy';     // nhớ gói định mua khi phải đi đăng nhập
  var KEY_ORDER = 'mt-qr-order';    // đơn đang chờ, để mở lại hộp vẫn tiếp tục
  var POLL_MS = 4000;

  var dlg = $('shopDialog');
  var state = { choice: 'year', order: null, skew: 0, poll: null, tick: null };

  function api(m, p, b) { return window.MTApi.request(m, p, b); }
  function acc() { return window.QRAccount.state(); }
  function shop() { var c = acc().cfg; return c && c.shop; }
  function toast(m) { window.QRApp.toast(m); }
  function money(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }
  function save(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }
  function read(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }

  function available() { var s = shop(); return !!(s && s.enabled); }

  function show(view) {
    dlg.querySelectorAll('.shop-view').forEach(function (v) { v.hidden = v.dataset.view !== view; });
  }

  /* ---------- Bước 1: chọn gói ---------- */
  function options() {
    var s = shop(), cfg = acc().cfg;
    var save12 = Math.max(0, Math.round((1 - s.year.price / (s.month.price * 12)) * 100));
    return [
      { id: 'year', name: 'Pro 12 tháng', price: s.year.price, desc: 'Chỉ ' + money(Math.round(s.year.price / 12)) + '/tháng', badge: save12 ? 'Tiết kiệm ' + save12 + '%' : 'Đáng mua nhất', best: true },
      { id: 'month', name: 'Pro 1 tháng', price: s.month.price, desc: 'Dùng thử trọn tính năng Pro trong ' + 31 + ' ngày' }
    ].map(function (o) { o.limit = cfg.proLimit; return o; });
  }

  function renderChoose() {
    var u = acc().user, cfg = acc().cfg;
    $('shopTitle').textContent = u && u.pro ? 'Gia hạn Pro' : 'Nâng cấp Pro';
    $('shopLead').textContent = 'Tối đa ' + cfg.proLimit.toLocaleString('vi-VN') + ' mã động, đặt tên đường dẫn riêng, mật khẩu, hẹn ngày tắt, thống kê đến 400 ngày, xuất CSV.' +
      (u && u.pro ? ' Thời hạn mua thêm được cộng nối tiếp.' : '');
    $('shopError').hidden = true;
    var list = options();
    if (!list.some(function (o) { return o.id === state.choice; })) state.choice = list[0].id;
    var box = $('shopOptions');
    box.textContent = '';
    list.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-opt' + (o.best ? ' is-best' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', o.id === state.choice ? 'true' : 'false');
      b.innerHTML = '<span class="opt-dot" aria-hidden="true"></span><span class="opt-main"><b></b><small></small></span><span class="opt-price"></span>';
      b.querySelector('b').textContent = o.name;
      b.querySelector('small').textContent = o.desc;
      b.querySelector('.opt-price').textContent = money(o.price);
      if (o.badge) {
        var badge = document.createElement('em');
        badge.className = 'opt-badge';
        badge.textContent = o.badge;
        b.querySelector('b').appendChild(badge);
      }
      b.addEventListener('click', function () { state.choice = o.id; renderChoose(); });
      box.appendChild(b);
    });
    var picked = list.filter(function (o) { return o.id === state.choice; })[0];
    $('shopBuy').textContent = u ? 'Thanh toán ' + money(picked.price) : 'Đăng nhập Google để mua';
    show('choose');
  }

  function buy() {
    if (!acc().user) {
      // Mua gắn với tài khoản: nhớ ý định, đăng nhập xong mở lại đúng gói
      save(KEY_INTENT, { choice: state.choice });
      window.QRAccount.login();
      return;
    }
    $('shopBuy').disabled = true;
    api('POST', '/orders', { product: state.choice }).then(function (r) {
      $('shopBuy').disabled = false;
      if (!r.ok) {
        $('shopError').textContent = r.data.error || 'Không tạo được đơn, thử lại sau';
        $('shopError').hidden = false;
        return;
      }
      startPay(r.data.order);
    }, function () {
      $('shopBuy').disabled = false;
      $('shopError').textContent = 'Mất kết nối, thử lại sau';
      $('shopError').hidden = false;
    });
  }

  /* ---------- Bước 2: quét QR ---------- */
  function startPay(order) {
    state.order = order;
    save(KEY_ORDER, { id: order.id });
    var p = order.pay;
    $('payTitle').textContent = order.title + ' · ' + money(order.amount);
    $('payQr').src = p.qrUrl;
    $('payBank').textContent = p.bankId;
    $('payAcc').textContent = p.accountNo;
    $('payName').textContent = p.accountName;
    $('payAmount').textContent = money(p.amount);
    $('payAmountRaw').textContent = String(p.amount);
    $('payCode').textContent = p.content;
    setStatus('wait');
    show('pay');
    startTimers();
  }

  function setStatus(kind) {
    var el = $('payStatus');
    el.dataset.kind = kind;
    el.lastElementChild.textContent = kind === 'expired'
      ? 'Mã QR đã hết hạn. Nếu bạn đã chuyển khoản, hệ thống vẫn ghi nhận trong 7 ngày. Chưa chuyển thì bấm "Đổi gói" để tạo mã mới.'
      : 'Đang chờ tiền về… trang tự kích hoạt khi nhận được, không cần làm gì thêm.';
  }

  function startTimers() {
    stopTimers();
    renderTimer();
    state.tick = setInterval(renderTimer, 1000);
    state.poll = setInterval(check, POLL_MS);
  }
  function stopTimers() {
    clearInterval(state.tick);
    clearInterval(state.poll);
    state.tick = state.poll = null;
  }

  function renderTimer() {
    if (!state.order) return;
    var left = Math.max(0, state.order.expiresAt - (Date.now() + state.skew));
    var m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    $('payTimer').textContent = left ? 'Còn ' + m + ':' + (s < 10 ? '0' : '') + s : 'Hết hạn';
    $('payTimer').classList.toggle('is-low', left < 120000);
    if (!left) setStatus('expired');
  }

  function check() {
    if (!state.order) return;
    api('GET', '/orders/' + state.order.id).then(function (r) {
      if (!r.ok) return;
      if (r.data.serverTime) state.skew = r.data.serverTime - Date.now();
      var o = r.data.order;
      if (o.status === 'paid') return paid(o);
      if (o.status === 'cancelled') { stopTimers(); save(KEY_ORDER, null); renderChoose(); }
    });
  }

  /* ---------- Bước 3: xong ---------- */
  function paid(o) {
    stopTimers();
    save(KEY_ORDER, null);
    state.order = null;
    window.QRAccount.refresh().then(function (u) {
      $('doneShopTitle').textContent = 'Đã kích hoạt ' + o.title + '!';
      $('doneShopText').textContent = 'Đã nhận ' + money(o.amount) + '.' + (u && u.proUntil ? ' Pro dùng đến ' + new Date(u.proUntil).toLocaleDateString('vi-VN') + '.' : '') + ' Cảm ơn bạn đã ủng hộ ManhTool.';
      show('done');
      if (!dlg.open && dlg.showModal) dlg.showModal();
    });
  }

  /* ---------- Mở / đóng ---------- */
  function open() {
    if (!available()) { toast('Thanh toán đang tạm tắt, liên hệ ManhTool 0988 392 321 để nâng cấp'); return false; }
    var pending = read(KEY_ORDER);
    if (pending && acc().user) {
      // Đang có đơn chờ → quay lại màn QR
      api('GET', '/orders/' + pending.id).then(function (r) {
        if (r.ok && r.data.order.status === 'paid') return paid(r.data.order);
        if (r.ok && r.data.order.pay) { state.skew = (r.data.serverTime || Date.now()) - Date.now(); startPay(r.data.order); }
        else { save(KEY_ORDER, null); renderChoose(); }
      });
    } else {
      renderChoose();
    }
    if (dlg.showModal && !dlg.open) dlg.showModal();
    return true;
  }

  function close() {
    stopTimers();
    if (dlg.open) dlg.close();
  }

  $('shopBuy').addEventListener('click', buy);
  $('shopClose').addEventListener('click', close);
  dlg.addEventListener('close', stopTimers);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  $('payBack').addEventListener('click', function () { stopTimers(); renderChoose(); });
  $('payCancel').addEventListener('click', function () {
    if (!state.order) return;
    api('POST', '/orders/' + state.order.id + '/cancel').then(function () {
      stopTimers();
      save(KEY_ORDER, null);
      state.order = null;
      toast('Đã hủy đơn');
      renderChoose();
    });
  });
  $('shopUse').addEventListener('click', function () { close(); $('ma-dong').scrollIntoView({ behavior: 'smooth' }); });
  dlg.querySelectorAll('[data-copy-from]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = $(b.dataset.copyFrom).textContent;
      window.QRApp.copy(text).then(function () {
        b.classList.add('is-done');
        setTimeout(function () { b.classList.remove('is-done'); }, 1200);
        toast('Đã chép ' + text);
      }, function () { toast('Không chép được, hãy gõ tay: ' + text); });
    });
  });

  // Vừa đăng nhập xong để mua → mở lại đúng gói đã chọn
  window.QRAccount.onChange(function (a) {
    var intent = read(KEY_INTENT);
    if (intent && a.user && available()) {
      save(KEY_INTENT, null);
      state.choice = intent.choice || state.choice;
      open();
    }
  });

  window.QRShop = { open: open, available: available };
})();
