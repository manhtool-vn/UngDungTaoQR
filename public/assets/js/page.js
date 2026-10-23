/* ManhTool — Tạo mã QR: trang văn bản (điều khoản, bảo mật). Nút sáng/tối và biểu mẫu báo cáo mã QR động vi phạm. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  $('themeToggle').addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem('mt-theme', dark ? 'light' : 'dark'); } catch (e) { /* bỏ qua */ }
  });

  /* ---------- Báo cáo mã vi phạm ---------- */
  var form = $('reportForm');
  if (!form) return;
  var msg = $('reportMsg'), btn = form.querySelector('button[type="submit"]');

  function show(ok, text) {
    msg.hidden = false;
    msg.className = 'report-msg ' + (ok ? 'is-ok' : 'is-bad');
    msg.innerHTML = '<svg class="ic"><use href="#i-' + (ok ? 'check-circle' : 'alert') + '"/></svg>';
    msg.appendChild(document.createTextNode(text));
  }

  // Mở từ trang tạo mã (Đọc mã QR từ ảnh → Báo cáo mã này): điền sẵn đường dẫn
  var pre = new URLSearchParams(location.search).get('ma');
  if (pre) form.elements.link.value = pre;

  // Gợi ý đúng tên miền in trong mã động của máy chủ này
  if (location.protocol !== 'file:') {
    window.MTApi.request('GET', '/config').then(function (r) {
      if (r.ok && r.data.shortBase) form.elements.link.placeholder = r.data.shortBase.replace(/^https?:\/\//, '') + 'abc123';
    }, function () { /* chạy không máy chủ */ });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var link = form.elements.link.value.trim();
    if (!link) { show(false, 'Hãy dán đường dẫn của mã QR cần báo cáo'); form.elements.link.focus(); return; }
    btn.disabled = true;
    window.MTApi.request('POST', '/reports', {
      link: link, reason: form.elements.reason.value, detail: form.elements.detail.value, contact: form.elements.contact.value
    }).then(function (r) {
      if (!r.ok) { show(false, (r.data && r.data.error) || 'Không gửi được, vui lòng thử lại'); return; }
      form.reset();
      show(true, r.data.already ? 'Mã này đã bị khóa rồi. Cảm ơn bạn đã báo.' : 'Đã nhận báo cáo. ManhTool sẽ kiểm tra và khóa mã nếu đúng là vi phạm. Cảm ơn bạn!');
    }, function () {
      show(false, 'Không kết nối được máy chủ. Bạn có thể gọi hoặc nhắn Zalo 0988 392 321 để báo.');
    }).then(function () { btn.disabled = false; });
  });
})();
