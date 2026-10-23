/* ManhTool — gọi API máy chủ. Token nằm trong cookie HttpOnly nên JavaScript không đọc được;
   khi access token (15 phút) hết hạn, máy chủ trả 401 token_expired → tự gọi /api/auth/refresh rồi gửi lại 1 lần. */
(function (root) {
  'use strict';

  var refreshing = null;

  function raw(method, path, body) {
    var headers = { 'X-Requested-With': 'maqr' };
    var isFile = typeof Blob !== 'undefined' && body instanceof Blob; // tải file lên: gửi nguyên nội dung
    if (body !== undefined) headers['Content-Type'] = isFile ? 'application/octet-stream' : 'application/json';
    return fetch('/api' + path, {
      method: method, headers: headers, credentials: 'same-origin', cache: 'no-store',
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; });
    });
  }

  // Nhiều yêu cầu cùng hết hạn một lúc chỉ làm mới 1 lần
  function refresh() {
    if (!refreshing) {
      refreshing = raw('POST', '/auth/refresh').then(function (r) {
        // 409: tab khác vừa làm mới xong, cookie mới đã có → đợi chút rồi coi như được
        if (r.status === 409) return new Promise(function (ok) { setTimeout(function () { ok(true); }, 400); });
        return r.ok;
      }, function () { return false; }).then(function (ok) { refreshing = null; return ok; });
    }
    return refreshing;
  }

  function request(method, path, body) {
    return raw(method, path, body).then(function (r) {
      if (r.status !== 401 || !r.data || r.data.code !== 'token_expired') return r;
      return refresh().then(function (ok) {
        if (ok) return raw(method, path, body);
        return { status: 401, ok: false, data: { error: 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại', code: 'logged_out' } };
      });
    });
  }

  root.MTApi = { request: request, refresh: refresh };
})(typeof self !== 'undefined' ? self : this);
