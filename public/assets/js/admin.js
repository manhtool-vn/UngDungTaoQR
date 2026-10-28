/* ManhTool — Tạo mã QR: trang quản trị (người dùng, kiểm duyệt mã động, đơn hàng, cài đặt, nhật ký) */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var me = null, users = [];

  function api(method, path, body) { return window.MTApi.request(method, path, body); }

  var toastTimer;
  function toast(msg) {
    $('toastMsg').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 2600);
  }

  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDay(v) { return v ? new Date(v).toLocaleDateString('vi-VN') : '—'; }
  function num(n) { return (Number(n) || 0).toLocaleString('vi-VN'); }
  function money(n) { return num(n) + 'đ'; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function tiles(box, list) {
    box.textContent = '';
    list.forEach(function (s) {
      var d = el('div', 'stat-tile');
      d.appendChild(el('b', '', s[1]));
      d.appendChild(el('span', '', s[0]));
      box.appendChild(d);
    });
  }

  function toggle(label, on, onChange, disabled) {
    var l = el('label', 'opt');
    l.innerHTML = '<input type="checkbox"><span class="switch" aria-hidden="true"></span><span class="visually-hidden"></span>';
    var input = l.firstChild;
    input.checked = on;
    input.disabled = !!disabled;
    l.lastChild.textContent = label;
    input.addEventListener('change', function () { onChange(input.checked, input); });
    return l;
  }

  function delBtn(label, onClick) {
    var b = el('button', 'icon-btn row-del');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>';
    b.addEventListener('click', onClick);
    return b;
  }

  /* ---------- Vào trang ---------- */
  function gate(title, text, showLogin) {
    $('gate').hidden = false;
    $('app').hidden = true;
    $('gateTitle').textContent = title;
    $('gateText').textContent = text;
    $('gateLogin').hidden = !showLogin;
  }

  api('GET', '/config').then(function (cfg) {
    if (!cfg.ok) return gate('Chưa có máy chủ', 'Trang quản trị cần chạy cùng máy chủ (npm start).', false);
    return api('GET', '/me').then(function (r) {
      if (r.status === 401 || !r.data.user) {
        return gate('Đăng nhập để vào trang quản trị', cfg.data.googleLogin
          ? 'Chỉ tài khoản quản trị mới xem được trang này.'
          : 'Đăng nhập Google chưa được cấu hình. Đặt GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong file .env rồi khởi động lại máy chủ.', cfg.data.googleLogin);
      }
      if (r.data.user.role !== 'admin') return gate('Không có quyền truy cập', 'Tài khoản ' + r.data.user.email + ' không phải quản trị viên.', false);
      me = r.data.user;
      $('gate').hidden = true;
      $('app').hidden = false;
      loadOverview();
      loadUsers();
    });
  }, function () { gate('Không kết nối được máy chủ', 'Kiểm tra máy chủ đã chạy chưa (npm start).', false); });

  /* ---------- Thẻ ---------- */
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== b.dataset.tab; });
      loadOverview();
      if (b.dataset.tab === 'orders') loadOrders();
      if (b.dataset.tab === 'codes') loadCodes();
      if (b.dataset.tab === 'reports') loadReports();
      if (b.dataset.tab === 'users') loadUsers();
      if (b.dataset.tab === 'promo') loadPromo();
    });
  });

  /* ---------- Miễn phí & giới thiệu ---------- */
  function promoCall(method, path, body) {
    return api(method, path, body).then(function (r) {
      if (!r.ok) throw new Error((r.data && r.data.error) || 'Lỗi máy chủ');
      return r.data;
    });
  }
  function loadPromo() {
    var P = window.MTPromo;
    window.MTPromoAdmin.mount($('promoAdmin'), {
      base: P.defaults('qr', '/assets/img/dsv24h.svg'),
      features: [{ key: 'pro', label: 'Toàn bộ tính năng Pro', hint: 'Thêm mã động, đặt tên đường dẫn, mật khẩu, hẹn ngày tắt, giới hạn lượt quét, thống kê 400 ngày, xuất CSV' }],
      keepLabel: 'Tài khoản đăng nhập trong thời gian miễn phí được giữ Pro vĩnh viễn. Dù tắt ô này, mã động tạo lúc miễn phí vẫn không bao giờ bị tạm dừng.',
      where: [
        'Trang chính: dải xanh đếm ngược ở đầu trang, thông báo tự hiện một lần mỗi phiên',
        'Bảng giá: giá gói Pro gạch ngang, ghi "Đang mở miễn phí đến …"',
        'Tài khoản đăng nhập dùng ngay mọi tính năng Pro; hộp Tài khoản ghi "Gói Pro miễn phí"',
        'Popup giới thiệu doansinhvien24h (gia sư lập trình, kho đồ án) cho người dùng bản miễn phí; cuối trang có dòng "Đồng hành cùng doansinhvien24h" để mở lại'
      ],
      load: function () { return promoCall('GET', '/admin/promo'); },
      saveFree: function (f) { return promoCall('PUT', '/admin/promo/free', { free: f }); },
      saveBrand: function (b) { return promoCall('PUT', '/admin/promo/brand', { brand: b }); },
      announce: function (f, brand) {
        P.announce(f, brand, {
          force: true, title: 'Gói Pro đang miễn phí',
          text: 'Tạo mã QR động, đặt đường dẫn riêng, đặt mật khẩu và xem thống kê dài ngày — không cần thanh toán.',
          perks: ['100 mã QR động', 'Đường dẫn riêng …/q/ten-ban', 'Mật khẩu, hẹn ngày tắt mã', f.keep ? 'Đăng nhập là giữ vĩnh viễn' : 'Thống kê đến 400 ngày'],
          cta: { label: 'Đăng nhập để dùng Pro miễn phí' },
          note: f.keep ? 'Đăng nhập Google trong thời gian này để giữ Pro vĩnh viễn, kể cả khi chương trình kết thúc.' : 'Mã QR động tạo trong thời gian này vẫn chạy bình thường sau khi chương trình kết thúc.'
        });
      },
      toast: function (m) { toast(m); }
    });
  }

  function setReportBadge(n) {
    $('reportBadge').hidden = !n;
    $('reportBadge').textContent = n > 99 ? '99+' : n;
  }

  /* ---------- Tổng quan + cài đặt + nhật ký ---------- */
  function loadOverview() {
    api('GET', '/admin/overview').then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được dữ liệu');
      var c = r.data.counts;
      tiles($('stats'), [['Tài khoản', num(c.users)], ['Hoạt động 7 ngày', num(c.active7d)], ['Đang có Pro', num(c.pro)], ['Mã động', num(c.codes)], ['Lượt quét hôm nay', num(c.scansToday)], ['Tổng lượt quét', num(c.scans)]]);
      setReportBadge(c.reportsOpen);
      fillSettings(r.data.settings);
      var list = $('audit');
      list.textContent = '';
      if (!r.data.audit.length) list.appendChild(el('li', 'audit-empty', 'Chưa có thao tác nào.'));
      r.data.audit.forEach(function (a) {
        var li = el('li');
        li.appendChild(el('time', '', fmtDate(a.at)));
        li.appendChild(el('span', '', a.actor + ' · ' + a.action + (a.target ? ' · ' + a.target : '')));
        list.appendChild(li);
      });
    });
  }

  function fillSettings(s) {
    $('redirectUri').textContent = s.redirectUri;
    $('sClientId').value = s.googleClientId;
    $('sClientSecret').value = '';
    $('secretState').textContent = s.googleClientSecretSet ? 'Đã có secret (không hiển thị lại để an toàn).' : 'Chưa có secret.';
    $('sEnabled').checked = s.googleLoginEnabled;
    $('sRegistration').checked = s.registrationOpen;
    $('sFree').value = s.freeDynamicLimit;
    $('sPro').value = s.proDynamicLimit;
    $('shortBase').textContent = s.shortBase + '…';
    document.querySelectorAll('[data-env]').forEach(function (x) { x.hidden = !s.fromEnv[x.dataset.env]; });
    $('sClientId').disabled = s.fromEnv.clientId;
    $('sClientSecret').disabled = s.fromEnv.clientSecret;
    $('sEnabled').disabled = s.fromEnv.enabled;
    $('googleState').textContent = s.googleReady ? 'Đăng nhập Google đang hoạt động.' : 'Đăng nhập Google đang tắt hoặc thiếu Client ID / secret.';
    $('googleState').className = 'google-state ' + (s.googleReady ? 'is-ok' : 'is-off');

    var p = s.payment;
    $('pEnabled').checked = p.enabled;
    $('pBank').value = p.bankId;
    $('pAcc').value = p.accountNo;
    $('pName').value = p.accountName;
    $('pMonth').value = p.priceMonth;
    $('pYear').value = p.priceYear;
    $('webhookUrl').textContent = p.webhookUrl;
    $('webhookState').textContent = p.webhookKeySet
      ? 'Khóa webhook đã đặt trong .env (PAYMENT_WEBHOOK_KEY). Trên SePay chọn kiểu chứng thực "API Key" và dán khóa đó.'
      : 'Chưa đặt PAYMENT_WEBHOOK_KEY trong .env: webhook đang tắt, chỉ xác nhận tay được.';
    $('payState').textContent = !p.enabled ? 'Đang tắt bán gói Pro.' : !p.ready ? 'Thiếu ngân hàng, số tài khoản hoặc tên chủ tài khoản.' : 'Đang bán gói Pro.';
    $('payState').className = 'google-state ' + (p.ready ? 'is-ok' : 'is-off');
  }

  document.querySelectorAll('[data-copy-from]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $(b.dataset.copyFrom).textContent;
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t) : Promise.reject())
        .then(function () { toast('Đã chép ' + t); }, function () { toast('Hãy bôi đen và chép thủ công'); });
    });
  });

  $('settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { registrationOpen: $('sRegistration').checked, freeDynamicLimit: +$('sFree').value, proDynamicLimit: +$('sPro').value };
    if (!$('sClientId').disabled) body.googleClientId = $('sClientId').value;
    if (!$('sClientSecret').disabled && $('sClientSecret').value.trim()) body.googleClientSecret = $('sClientSecret').value;
    if (!$('sEnabled').disabled) body.googleLoginEnabled = $('sEnabled').checked;
    body.payment = {
      enabled: $('pEnabled').checked, bankId: $('pBank').value, accountNo: $('pAcc').value, accountName: $('pName').value,
      priceMonth: +$('pMonth').value, priceYear: +$('pYear').value
    };
    api('PUT', '/admin/settings', body).then(function (r) {
      toast(r.ok ? 'Đã lưu cài đặt' : r.data.error || 'Không lưu được');
      if (r.ok) loadOverview();
    });
  });

  /* ---------- Đơn hàng ---------- */
  var orderStatus = '';
  var STATUS_TEXT = { pending: 'Chờ thanh toán', paid: 'Đã thanh toán', expired: 'Hết hạn', cancelled: 'Đã hủy' };
  var PAY_RESULT = { unmatched: 'Không rõ đơn', underpaid: 'Chuyển thiếu', already_paid: 'Chuyển lần 2', order_closed: 'Đơn đã đóng', duplicate: 'Trùng', ignored: 'Bỏ qua' };

  document.querySelectorAll('[data-ostatus]').forEach(function (b) {
    b.addEventListener('click', function () {
      orderStatus = b.dataset.ostatus;
      document.querySelectorAll('[data-ostatus]').forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
      loadOrders();
    });
  });

  function loadOrders() {
    api('GET', '/admin/orders?status=' + orderStatus).then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được đơn hàng');
      var rv = r.data.revenue;
      tiles($('revenue'), [['Doanh thu hôm nay', money(rv.today)], ['30 ngày qua', money(rv.days30)], ['Tổng doanh thu', money(rv.total)], ['Đơn đã trả', num(rv.orders)]]);

      var tb = $('orders');
      tb.textContent = '';
      $('ordersEmpty').hidden = r.data.orders.length > 0;
      r.data.orders.forEach(function (o) {
        var tr = el('tr');
        var code = el('td');
        code.appendChild(el('code', '', o.code));
        var st = el('td');
        st.appendChild(el('span', 'order-st is-' + o.status, STATUS_TEXT[o.status] + (o.paidVia === 'admin' ? ' (tay)' : '')));
        var act = el('td');
        if (o.status !== 'paid') {
          var b = el('button', 'btn-ghost row-btn');
          b.type = 'button';
          b.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Xác nhận';
          b.title = 'Đã nhận tiền → kích hoạt Pro cho khách';
          b.addEventListener('click', function () {
            if (!window.confirm('Xác nhận đã nhận ' + money(o.amount) + ' cho đơn ' + o.code + ' của ' + o.email + '?')) return;
            api('POST', '/admin/orders/' + o.id + '/confirm').then(function (x) {
              toast(x.ok ? 'Đã kích hoạt Pro cho ' + o.email : x.data.error || 'Không xác nhận được');
              loadOrders();
            });
          });
          act.appendChild(b);
        }
        [code, el('td', '', o.email), el('td', '', o.title), el('td', '', money(o.amount) + (o.paidAmount && o.paidAmount !== o.amount ? ' (nhận ' + money(o.paidAmount) + ')' : '')),
          st, el('td', '', fmtDate(o.paidAt || o.createdAt)), act].forEach(function (td) { tr.appendChild(td); });
        tb.appendChild(tr);
      });

      var ul = $('unmatched');
      ul.textContent = '';
      if (!r.data.unmatched.length) ul.appendChild(el('li', 'audit-empty', 'Không có khoản nào.'));
      r.data.unmatched.forEach(function (p) {
        var li = el('li');
        li.appendChild(el('time', '', fmtDate(p.at)));
        li.appendChild(el('span', '', money(p.amount) + ' · ' + (PAY_RESULT[p.result] || p.result) + (p.code ? ' · mã ' + p.code : '') + ' · "' + p.content + '"'));
        ul.appendChild(li);
      });
    });
  }

  /* ---------- Mã động ---------- */
  var STATE = { active: 'Đang chạy', off: 'Chủ đã tắt', quota: 'Vượt hạn mức', expired: 'Hết hạn', limit: 'Đủ lượt', blocked: 'Bị khóa' };
  var codeTimer;
  $('cq').addEventListener('input', function () { clearTimeout(codeTimer); codeTimer = setTimeout(loadCodes, 250); });

  function loadCodes() {
    api('GET', '/admin/codes?q=' + encodeURIComponent($('cq').value.trim())).then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được danh sách mã');
      var tb = $('codes');
      tb.textContent = '';
      $('codesEmpty').hidden = r.data.codes.length > 0;
      $('codeCount').textContent = r.data.codes.length + ' mã';
      r.data.codes.forEach(function (c) {
        var tr = el('tr');
        if (c.blocked) tr.className = 'is-blocked';
        var who = el('td');
        var a = el('a', '', c.slug);
        a.href = c.shortUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        who.appendChild(a);
        who.appendChild(el('small', 'state-text', c.name));
        var tg = el('td');
        var t = el('a', '', c.target.length > 70 ? c.target.slice(0, 70) + '…' : c.target);
        t.href = c.target;
        t.target = '_blank';
        t.rel = 'noopener noreferrer nofollow';
        tg.appendChild(t);
        var lock = el('td');
        lock.appendChild(toggle('Khóa mã ' + c.slug, c.blocked, function (v, input) {
          api('PATCH', '/admin/codes/' + c.id, { blocked: v }).then(function (x) {
            if (!x.ok) { input.checked = !v; return toast(x.data.error || 'Không cập nhật được'); }
            toast(v ? 'Đã khóa mã ' + c.slug : 'Đã mở khóa mã ' + c.slug);
            loadCodes();
          });
        }));
        var del = el('td');
        del.appendChild(delBtn('Xóa mã ' + c.slug, function () {
          if (!window.confirm('Xóa vĩnh viễn mã ' + c.slug + ' của ' + c.owner + '?')) return;
          api('DELETE', '/admin/codes/' + c.id).then(function (x) { toast(x.ok ? 'Đã xóa mã ' + c.slug : x.data.error || 'Không xóa được'); loadCodes(); });
        }));
        [who, el('td', '', c.owner), tg, el('td', '', num(c.total)), el('td', '', STATE[c.state] || c.state), lock, del].forEach(function (td) { tr.appendChild(td); });
        tb.appendChild(tr);
      });
    });
  }

  /* ---------- Báo cáo vi phạm ---------- */
  var reportStatus = 'open';
  var CLOSED_TEXT = { blocked: 'Đã khóa mã', dismissed: 'Bỏ qua', gone: 'Mã đã xóa' };

  document.querySelectorAll('[data-rstatus]').forEach(function (b) {
    b.addEventListener('click', function () {
      reportStatus = b.dataset.rstatus;
      document.querySelectorAll('[data-rstatus]').forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
      loadReports();
    });
  });

  function link(href, text) {
    var a = el('a', '', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    return a;
  }

  function resolveReport(r, action) {
    if (action === 'block' && !window.confirm('Khóa mã ' + r.slug + '? Người quét sẽ thấy trang "Mã QR đã bị khóa", chủ mã không bật lại được.')) return;
    api('POST', '/admin/reports/' + r.id, { action: action }).then(function (x) {
      if (!x.ok) return toast(x.data.error || 'Không cập nhật được');
      toast(action === 'block' ? 'Đã khóa mã ' + r.slug : 'Đã bỏ qua báo cáo');
      setReportBadge(x.data.open);
      loadReports();
    });
  }

  function loadReports() {
    api('GET', '/admin/reports?status=' + reportStatus).then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được báo cáo');
      setReportBadge(r.data.open);
      var tb = $('reports');
      tb.textContent = '';
      $('reportsEmpty').hidden = r.data.reports.length > 0;
      $('reportCount').textContent = r.data.reports.length + ' báo cáo';
      r.data.reports.forEach(function (x) {
        var c = x.code;
        var tr = el('tr');
        var code = el('td');
        code.appendChild(c ? link(c.shortUrl, x.slug) : el('span', '', x.slug));
        if (c) code.appendChild(el('small', 'state-text', num(c.total) + ' lượt quét'));
        var why = el('td');
        why.appendChild(el('b', '', x.reasonText));
        if (x.detail) why.appendChild(el('small', 'state-text', x.detail));
        if (x.contact) why.appendChild(el('small', 'state-text', 'Liên hệ: ' + x.contact));
        if (x.status === 'open' && x.sameCode > 1) why.appendChild(el('small', 'state-text', x.sameCode + ' báo cáo cho mã này'));
        var tg = el('td');
        var dest = c ? c.target : x.reportedTarget;
        tg.appendChild(link(dest, dest.length > 70 ? dest.slice(0, 70) + '…' : dest));
        if (c && c.target !== x.reportedTarget) tg.appendChild(el('small', 'state-text', 'Lúc báo cáo: ' + x.reportedTarget));
        var st = el('td');
        if (x.status === 'open') st.appendChild(el('span', 'order-st' + (c && c.blocked ? '' : ' is-pending'), c ? STATE[c.state] || c.state : 'Mã đã xóa'));
        else {
          st.appendChild(el('span', 'order-st' + (x.status === 'blocked' ? ' is-paid' : ''), CLOSED_TEXT[x.status] || x.status));
          if (x.closedBy) st.appendChild(el('small', 'state-text', x.closedBy + ' · ' + fmtDate(x.closedAt)));
        }
        var act = el('td');
        if (x.status === 'open') {
          var wrap = el('div', 'row-actions');
          if (c && !c.blocked) {
            var b = el('button', 'btn-danger row-btn');
            b.type = 'button';
            b.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg>Khóa mã';
            b.addEventListener('click', function () { resolveReport(x, 'block'); });
            wrap.appendChild(b);
          }
          var d = el('button', 'btn-ghost row-btn');
          d.type = 'button';
          d.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Bỏ qua';
          d.addEventListener('click', function () { resolveReport(x, 'dismiss'); });
          wrap.appendChild(d);
          act.appendChild(wrap);
        }
        [el('td', '', fmtDate(x.at)), code, why, tg, el('td', '', c ? c.owner : '—'), st, act].forEach(function (td) { tr.appendChild(td); });
        tb.appendChild(tr);
      });
    });
  }

  /* ---------- Người dùng ---------- */
  var searchTimer;
  $('q').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(loadUsers, 250); });

  function loadUsers() {
    api('GET', '/admin/users?q=' + encodeURIComponent($('q').value.trim())).then(function (r) {
      if (!r.ok) return toast(r.data.error || 'Không tải được danh sách');
      users = r.data.users;
      renderUsers();
    });
  }

  function patchUser(u, body, input) {
    api('PATCH', '/admin/users/' + u.id, body).then(function (r) {
      if (!r.ok) {
        toast(r.data.error || 'Không cập nhật được');
        if (input) input.checked = !input.checked;
        return;
      }
      Object.assign(u, r.data.user);
      renderUsers();
      loadOverview();
    });
  }

  function renderUsers() {
    var tb = $('users');
    tb.textContent = '';
    $('usersEmpty').hidden = users.length > 0;
    $('userCount').textContent = users.length + ' tài khoản';
    users.forEach(function (u) {
      var tr = el('tr');
      if (!u.active) tr.className = 'is-blocked';

      var whoTd = el('td');
      var who = el('div', 'who');
      whoTd.appendChild(who);
      var img = el(u.picture ? 'img' : 'span', 'avatar');
      if (u.picture) { img.src = u.picture; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.width = 32; img.height = 32; }
      else img.textContent = (u.name || u.email).charAt(0).toUpperCase();
      var info = el('div');
      info.appendChild(el('b', '', u.name + (u.id === me.id ? ' (bạn)' : '')));
      info.appendChild(el('small', '', u.email));
      who.appendChild(img);
      who.appendChild(info);

      var role = el('td');
      var sel = el('select', 'select');
      sel.setAttribute('aria-label', 'Vai trò của ' + u.email);
      [['user', 'Người dùng'], ['admin', 'Quản trị']].forEach(function (o) { sel.appendChild(new Option(o[1], o[0])); });
      sel.value = u.role;
      sel.disabled = u.id === me.id;
      sel.addEventListener('change', function () { patchUser(u, { role: sel.value }); });
      role.appendChild(sel);

      // Gói: còn hạn đến ngày nào + tặng thêm ngày / bỏ Pro
      var plan = el('td');
      var on = u.proUntil && u.proUntil > Date.now();
      plan.appendChild(el('span', 'order-st' + (on ? ' is-paid' : ''), on ? 'Pro đến ' + fmtDay(u.proUntil) : u.role === 'admin' ? 'Quản trị' : 'Miễn phí'));
      var pick = el('select', 'select');
      pick.setAttribute('aria-label', 'Đổi gói của ' + u.email);
      [['', 'Đổi gói…'], ['31', '+1 tháng Pro'], ['366', '+12 tháng Pro']].concat(u.proUntil ? [['clear', 'Bỏ Pro']] : []).forEach(function (o) { pick.appendChild(new Option(o[1], o[0])); });
      pick.style.marginTop = '6px';
      pick.addEventListener('change', function () {
        var v = pick.value;
        if (!v) return;
        if (v === 'clear') { if (window.confirm('Bỏ gói Pro của ' + u.email + '?')) patchUser(u, { clearPro: true }); else pick.value = ''; return; }
        patchUser(u, { proDays: Number(v) });
      });
      plan.appendChild(el('br'));
      plan.appendChild(pick);

      var act = el('td');
      act.appendChild(toggle('Hoạt động: ' + u.email, u.active, function (v, input) { patchUser(u, { active: v }, input); }, u.id === me.id));
      act.appendChild(el('small', 'state-text', u.active ? (u.sessions ? u.sessions + ' thiết bị' : 'Đã đăng xuất') : 'Đã khóa'));

      var codes = el('td', '', u.codes ? num(u.codes) + ' mã · ' + num(u.scans) + ' lượt' : '—');
      var last = el('td', '', fmtDate(u.lastLoginAt));
      last.title = 'Tạo lúc ' + fmtDate(u.createdAt);

      var del = el('td');
      if (u.id !== me.id) {
        del.appendChild(delBtn('Xóa ' + u.email, function () {
          if (!window.confirm('Xóa vĩnh viễn tài khoản ' + u.email + ' và toàn bộ mã động của họ? Mã đã in sẽ ngừng hoạt động.')) return;
          api('DELETE', '/admin/users/' + u.id).then(function (r) {
            if (!r.ok) return toast(r.data.error || 'Không xóa được');
            toast('Đã xóa ' + u.email);
            loadUsers();
            loadOverview();
          });
        }));
      }

      [whoTd, role, plan, act, codes, last, del].forEach(function (td) { tr.appendChild(td); });
      tb.appendChild(tr);
    });
  }

  /* ---------- Nền sáng / tối ---------- */
  var root = document.documentElement;
  $('themeToggle').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('mt-theme', next); } catch (e) { /* bỏ qua */ }
  });
})();
