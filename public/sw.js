/* ManhTool — Tạo mã QR: phần tạo mã tĩnh chạy được khi mất mạng.
   Ưu tiên mạng (luôn lấy bản mới nhất), mất mạng thì dùng bản đã lưu. Đổi VERSION khi muốn xóa bộ nhớ cũ.
   Không bao giờ lưu /q/ (mã động phải luôn hỏi máy chủ để đếm lượt và lấy đích mới), /api/ và trang quản trị. */
var VERSION = 'ma-qr-v2';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'dieu-khoan.html', 'bao-mat.html',
  'assets/css/style.css', 'assets/css/account.css', 'assets/css/qr.css', 'assets/css/doc.css', 'assets/css/mt-promo.css',
  'assets/js/boot.js', 'assets/js/qr-core.js', 'assets/js/qr-render.js', 'assets/js/payloads.js', 'assets/js/zip.js',
  'assets/js/api.js', 'assets/js/app.js', 'assets/js/account.js', 'assets/js/codes.js', 'assets/js/shop.js', 'assets/js/page.js', 'assets/js/mt-promo.js',
  'assets/vendor/jsQR.js',
  'assets/img/mark-192.png', 'assets/img/logo-512.png', 'assets/img/logo-mark-96.png', 'assets/img/donate-qr.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  if (sameOrigin && /^\/(q|api)\/|^\/admin/.test(url.pathname)) return;

  e.respondWith(fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit || Response.error();
      // /dieu-khoan → dieu-khoan.html; trang lạ → trang tạo mã
      return caches.match(url.pathname.slice(1) + '.html').then(function (page) { return page || caches.match('index.html'); });
    });
  }));
});
