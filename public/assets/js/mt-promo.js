/* ManhTool — popup giới thiệu thương hiệu & chương trình mở miễn phí (dùng chung cho mọi dự án ManhTool).
   Cùng một file ở mọi dự án — sửa ở đây thì chép lại sang các dự án khác.
   Chạy được ở trình duyệt (window.MTPromo) lẫn Node (require: server dùng phần chuẩn hoá cấu hình).

   Cấu hình
     MTPromo.defaults(app, logo)        — lời giới thiệu mặc định (doansinhvien24h: gia sư lập trình, kho đồ án, làm web chuẩn SEO)
     MTPromo.suggest(app)               — phần chữ gợi ý (khẩu hiệu, giới thiệu, 3 dịch vụ, nút chính)
     MTPromo.normalizeBrand(b, base)    — lọc cấu hình popup admin gửi lên (base = defaults của dự án)
     MTPromo.normalizeFree(f, keys)     — lọc cấu hình chương trình miễn phí (keys = các quyền lợi dự án có thể mở)
     MTPromo.freeError(f, keys, now)    — lý do cấu hình miễn phí không hợp lệ ('' = hợp lệ)
     MTPromo.freeOn(f, now) / freeHas(f, key, now) — chương trình đang chạy? / đang mở quyền lợi key?
   Giao diện (chỉ trình duyệt)
     MTPromo.show(brand, o)             — popup giới thiệu ngay (o.kick: dòng nhãn đầu, o.context: 'app' | 'preview', o.foot: {label, href})
     MTPromo.schedule(brand, o)         — hẹn giờ theo cài đặt (trễ bao lâu, bao lâu hiện lại); o.guard() = false thì đợi tiếp
     MTPromo.announce(free, brand, o)   — thông báo chương trình miễn phí (đồng hồ đếm ngược, quyền lợi, nút chính)
     MTPromo.scheduleAnnounce(free, brand, o) — như trên, mỗi chương trình chỉ tự hiện một lần mỗi phiên
     MTPromo.bar(free, o)               — dải xanh đầu trang "Đang mở miễn phí … còn …", bấm để mở lại thông báo
     MTPromo.chip(brand, host, o)       — dòng nhỏ "Đồng hành cùng doansinhvien24h", bấm để mở lại lời giới thiệu
     MTPromo.rich(text)                 — **đậm**, đoạn, gạch đầu dòng, :tên-icon: → HTML an toàn
     MTPromo.gate(brand, { action })    — xem xong lời giới thiệu mới tiếp tục (Promise); brand.gate = tần suất, brand.gateSec = số giây
     MTPromo.gateClicks(brand, o)       — tự áp gate cho mọi nút có data-mp-gate="<việc>"; o.exempt() = true thì cho qua
   Trang tĩnh: <script src="mt-promo.js" data-app="tool" data-logo="assets/img/dsv24h.svg" defer> tự hẹn giờ popup,
   gắn dòng nhỏ vào phần tử [data-mp-chip]. Thêm ?mt-promo vào địa chỉ để xem ngay. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MTPromo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- thương hiệu được quảng bá ----------
  // Các công cụ ManhTool miễn phí, đồng hành cùng doansinhvien24h: gia sư lập trình 1-1/nhóm, kho đồ án CNTT, làm web chuẩn SEO.
  // LANDING: trang giới thiệu (thư mục GiaSuLapTrinh) — đổi tên miền ở đây là đổi khắp các popup.
  const LANDING = 'https://manhtool.id.vn/gia-su-lap-trinh/';
  const SITE = {
    phone: '0988392321', zalo: '0988392321', email: 'doansinhvien24h@gmail.com',
    website: LANDING, facebook: 'https://www.facebook.com/profile.php?id=61593853584000',
  };
  const GREEN = '#0e7c5a';
  const BRAND_COLOR = '#3b4fa8'; // xanh navy lấy từ logo doansinhvien24h — nổi bật trên giao diện xanh lá của ManhTool
  const SERVICES = [
    { icon: 'users', name: 'Gia sư lập trình 1-1 & nhóm', desc: 'Frontend, backend, fullstack theo lộ trình riêng, học bằng dự án thật, có người review code', url: LANDING },
    { icon: 'book', name: 'Kho đồ án CNTT doansinhvien24h', desc: 'Đồ án, bài tập lớn, source code có demo: Node.js, React, Laravel, Spring Boot', url: 'https://doansinhvien24h.vn/projects' },
    { icon: 'globe', name: 'Làm website, app chuẩn SEO', desc: 'Senior Web Developer nhận làm web, app theo yêu cầu: chạy nhanh, chuẩn SEO, dễ mở rộng', url: LANDING + '#lam-web' },
  ];

  // app: dự án đang hiện popup (hengio, qr, ghichu, lich, quayso, tool) — hiện mọi dự án dùng chung một nội dung
  function suggest() {
    return {
      tagline: 'Gia sư lập trình · Kho đồ án CNTT · Web chuẩn SEO',
      about: [
        '**Code giỏi thật sự — học 1-1 cùng Senior Web Developer**',
        'Công cụ ManhTool miễn phí và sẽ luôn miễn phí. Người làm ra chúng nhận **gia sư lập trình 1-1 hoặc theo nhóm**: frontend, backend, fullstack — học bằng dự án thật, có người review từng dòng code.\n- Python, JavaScript, Java\n- MySQL, SQL Server, PostgreSQL, MongoDB, Redis\n- ORM, JWT, OAuth, Microservices, SEO kỹ thuật',
        ':graduation: **Sinh viên CNTT?** Kho đồ án, bài tập lớn có demo tại **doansinhvien24h.vn**, kèm định hướng đề tài, hướng dẫn khoá luận và báo cáo để bạn tự tin bảo vệ.',
      ].join('\n\n'),
      ctaLabel: 'Nhắn Zalo tư vấn lộ trình miễn phí',
      products: SERVICES.map((p) => Object.assign({}, p)),
    };
  }
  function defaults(app, logo) {
    return Object.assign({
      enabled: true, name: 'doansinhvien24h', logo: logo || '', ctaUrl: '',
      phone: SITE.phone, zalo: SITE.zalo, email: SITE.email, website: SITE.website, facebook: SITE.facebook,
      // delay: hiện sau bao nhiêu giây trang hiển thị · frequency: always | session | day
      // lock: số giây phải chờ mới đóng được · scrollClose: phải cuộn xuống hết mới đóng (đi kèm lock)
      delay: 30, frequency: 'day', lock: 3, color: BRAND_COLOR, scrollClose: false,
      // gate: bắt xem lời giới thiệu trước khi dùng tính năng miễn phí (lưu, tải, sao chép…) — off | always | session | day
      // gateSec: số giây phải xem trước khi nút "Tiếp tục" bấm được
      gate: 'day', gateSec: 5,
    }, suggest(app));
  }

  // ---------- icon nét (kiểu Lucide, nét 2px) — không dùng emoji ----------
  const ICONS = {
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3M6.4 18.7 4 21M17.6 18.7 20 21"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M8 7h7M8 11h5"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M15.5 15v-1.5a2 2 0 0 1 4 0V15"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sparkles: '<path d="M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5M22 10v6"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    crown: '<path d="m2 6 4 12h12l4-12-6 5-4-7-4 7z"/><path d="M6 21h12"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-.5a2 2 0 0 1 2-2h1.5A4.5 4.5 0 0 0 22 13 11 11 0 0 0 12 2z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };
  const ICON_NAMES = Object.keys(ICONS).filter((k) => !['check', 'x', 'arrow-right', 'arrow-down', 'chevron'].includes(k));
  const icon = (name, cls) => `<svg class="mp-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.sparkles}</svg>`;

  // ---------- chuẩn hoá cấu hình (server lẫn trình duyệt dùng chung) ----------
  const str = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
  const num = (v, min, max, def) => { const n = Math.round(Number(v)); return v === '' || v == null || !Number.isFinite(n) ? def : Math.max(min, Math.min(max, n)); };
  // link: http(s) hoặc đường dẫn trong trang ("/…") · ảnh: chỉ ảnh của chính trang (CSP các dự án chặn ảnh ngoài)
  const safeHref = (v) => { const u = str(v, 300); return /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\/(?!\/)[^\s"'<>]*$/.test(u) ? u : ''; };
  const safeImg = (v) => { const u = str(v, 200); return /^(?!\/\/)[\w./-]+\.(png|jpe?g|webp|svg)$/i.test(u) && !u.includes('..') ? u : ''; };
  const phone = (v) => { const p = str(v, 20).replace(/[^\d+]/g, ''); return /^\+?\d{8,15}$/.test(p) ? p : ''; };
  const FREQ = ['always', 'session', 'day'];
  const GATES = ['off', 'always', 'session', 'day'];

  function normalizeBrand(b, base) {
    b = b && typeof b === 'object' ? b : {};
    base = base || defaults('tool');
    const z = str(b.zalo, 80);
    return {
      enabled: b.enabled !== false,
      name: str(b.name, 60) || base.name,
      tagline: str(b.tagline, 120), about: str(b.about, 1500),
      logo: safeImg(b.logo) || base.logo || '',
      ctaLabel: str(b.ctaLabel, 40), ctaUrl: safeHref(b.ctaUrl),
      phone: phone(b.phone), zalo: phone(z) || (/^https:\/\/zalo\.me\/[\w-]+$/i.test(z) ? z : ''),
      email: /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(str(b.email, 120)) ? str(b.email, 120) : '',
      website: safeHref(b.website), facebook: safeHref(b.facebook),
      products: (Array.isArray(b.products) ? b.products : []).slice(0, 6).map((p) => ({
        icon: ICON_NAMES.includes(p && p.icon) ? p.icon : 'sparkles', name: str(p && p.name, 60), desc: str(p && p.desc, 160), url: safeHref(p && p.url),
      })).filter((p) => p.name),
      delay: num(b.delay, 0, 300, base.delay),
      frequency: FREQ.includes(b.frequency) ? b.frequency : base.frequency,
      // tối đa 15 giây: chờ lâu hơn người dùng dễ bực và thoát hẳn trang
      lock: num(b.lock, 0, 15, base.lock),
      color: /^#[0-9a-f]{6}$/i.test(String(b.color || '')) ? String(b.color).toLowerCase() : base.color,
      scrollClose: b.scrollClose == null ? !!base.scrollClose : !!b.scrollClose,
      gate: GATES.includes(b.gate) ? b.gate : (base.gate || 'off'),
      gateSec: num(b.gateSec, 1, 15, base.gateSec || 5),
    };
  }

  // Chương trình mở miễn phí: { active, features: [quyền lợi], label, startsAt, endsAt (ms, 0 = không giới hạn), keep }
  // keep: những gì người dùng nhận/tạo trong thời gian miễn phí được giữ vĩnh viễn (mỗi dự án tự định nghĩa "giữ" là gì)
  function normalizeFree(f, keys) {
    if (!f || typeof f !== 'object') return null;
    const features = [...new Set((Array.isArray(f.features) ? f.features : []).filter((k) => (keys || []).includes(k)))];
    if (!features.length) return null;
    const t = (v) => { const n = Math.round(Number(v)); return n > 0 ? n : 0; };
    const startsAt = t(f.startsAt); const endsAt = t(f.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) return null;
    return { active: f.active !== false, features, label: str(f.label, 60), startsAt, endsAt, keep: f.keep !== false };
  }
  function freeError(f, keys, now) {
    if (!f || typeof f !== 'object') return 'Thiếu cấu hình chương trình';
    if (!(Array.isArray(f.features) && f.features.some((k) => (keys || []).includes(k)))) return 'Chọn ít nhất một quyền lợi để mở miễn phí';
    const s = Math.round(Number(f.startsAt)) || 0; const e = Math.round(Number(f.endsAt)) || 0;
    if (s && e && e <= s) return 'Giờ kết thúc phải sau giờ bắt đầu';
    if (e && e <= (now || Date.now())) return 'Thời điểm kết thúc đã qua — chọn lại ngày giờ kết thúc';
    return '';
  }
  function freeOn(f, now) {
    now = now || Date.now();
    return f && f.active && (!f.startsAt || f.startsAt <= now) && (!f.endsAt || now < f.endsAt) ? f : null;
  }
  const freeHas = (f, key, now) => { const x = freeOn(f, now); return !!x && x.features.includes(key); };

  // ---------- định dạng ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const href = (u) => (/^https?:\/\//i.test(u || '') || /^\/(?!\/)/.test(u || '') ? u : '');
  // đoạn giới thiệu: **chữ** → tô nổi bật · :tên-icon: → icon · dòng trống → đoạn mới · các dòng "- …" liền nhau → danh sách ✓
  // (escape từng dòng trước rồi mới thay → không chèn được HTML)
  const inline = (t) => esc(t)
    .replace(/\*\*\s*([^*\n]+?)\s*\*\*/g, '<mark>$1</mark>')
    .replace(/:([a-z-]+):/g, (m, n) => (ICONS[n] ? icon(n, 'mp-inl') : m));
  function rich(s) {
    return String(s || '').trim().split(/\n\s*\n/).map((block) => {
      let html = ''; let lines = []; let items = [];
      const flush = () => {
        if (lines.length) html += `<p>${lines.map(inline).join('<br>')}</p>`;
        if (items.length) html += `<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`;
        lines = []; items = [];
      };
      block.split('\n').forEach((line) => {
        const m = line.match(/^\s*[-•✓*]\s+(.+)$/);
        if (m) { if (lines.length) flush(); items.push(m[1].trim()); } else if (line.trim()) { if (items.length) flush(); lines.push(line.trim()); }
      });
      flush();
      return html;
    }).join('');
  }
  const two = (n) => String(n).padStart(2, '0');
  const ddmm = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())} ${d.getDate()}/${d.getMonth() + 1}`; };
  const zaloHref = (z) => (/^https?:/.test(z) ? z : 'https://zalo.me/' + String(z).replace(/^\+?84/, '0'));
  const colorOf = (b) => (b && /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : GREEN);
  // màu sáng (vàng, hồng phấn…): chữ trên dải đầu chuyển sang màu tối cho đọc được
  const isLight = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const l = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.36;
  };
  const lockOf = (b) => Math.max(0, Math.min(15, Number(b && b.lock) || 0));

  const core = {
    SITE, LANDING, SERVICES, ICON_NAMES, defaults, suggest, normalizeBrand, normalizeFree, freeError, freeOn, freeHas, rich, icon, esc,
  };
  if (typeof document === 'undefined') return core;

  // =====================================================================================
  // Phần giao diện (trình duyệt)
  // =====================================================================================
  const KEY = 'mt_promo_seen_';
  // bao lâu hiện lại: always = mỗi lần mở trang · session = mỗi phiên trình duyệt · day = mỗi 24 giờ (bộ nhớ bị chặn → vẫn hiện)
  function seen(freq, scope) {
    try {
      if (freq === 'session') return !!sessionStorage.getItem(KEY + scope);
      if (freq === 'day') return Date.now() - Number(localStorage.getItem(KEY + scope) || 0) < 86400e3;
    } catch (e) { /* bỏ qua */ }
    return false;
  }
  function mark(freq, scope) {
    try {
      if (freq === 'session') sessionStorage.setItem(KEY + scope, '1');
      if (freq === 'day') localStorage.setItem(KEY + scope, String(Date.now()));
    } catch (e) { /* bỏ qua */ }
  }
  // Đã xem lời giới thiệu (đóng popup sau khi hết giờ chờ) — "xem xong mới tiếp tục" cho qua ngay trong khoảng tần suất
  const VIEW = 'mt_promo_viewed';
  function viewed(freq) {
    if (freq === 'off') return true;
    if (freq === 'always') return false;
    try {
      if (freq === 'session') return !!sessionStorage.getItem(VIEW);
      return Date.now() - Number(localStorage.getItem(VIEW) || 0) < 86400e3;
    } catch (e) { return false; }
  }
  function markViewed() {
    try { sessionStorage.setItem(VIEW, '1'); localStorage.setItem(VIEW, String(Date.now())); } catch (e) { /* bỏ qua */ }
  }
  // người dùng đang gõ / bấm thì chưa hiện (đợi rảnh tay 2,5 giây) — không chen ngang lúc đang làm việc
  let lastInput = 0;
  ['keydown', 'input', 'pointerdown', 'wheel', 'touchmove'].forEach((ev) => document.addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true }));
  // đang mở hộp thoại khác (của trang hoặc của chính popup này), tab ẩn, toàn màn hình → chưa hiện
  const modalOpen = () => [...document.querySelectorAll('.mp-bd, dialog[open], [aria-modal="true"]')].some((n) => n.getClientRects().length > 0);
  const busy = () => Date.now() - lastInput < 2500 || modalOpen() || document.hidden || !!document.fullscreenElement;
  // đếm thời gian chỉ khi trang đang hiển thị (tab ẩn thì để dành), rồi đợi lúc rảnh tay mới gọi fn
  function whenReady(fn, ms, guard) {
    let left = Math.max(0, ms || 0);
    const step = 500;
    const iv = setInterval(() => {
      if (document.hidden) return;
      left -= step;
      if (left > 0) return;
      if (busy() || (guard && !guard())) return;
      clearInterval(iv); fn();
    }, step);
  }

  // ---------- khung hộp thoại: nền mờ, máy tính ở giữa, điện thoại trượt lên từ đáy ----------
  // lock > 0: trong N giây đầu không đóng được (nút × là vòng đếm ngược, "Để sau" mờ đi, Esc/bấm nền không tác dụng — bấm thử thì
  // vòng đếm rung nhẹ). Chỉ đếm khi trang đang hiển thị. scroll: nội dung dài thì phải cuộn xuống hết mới đóng được.
  let current = null;
  const RING = 2 * Math.PI * 15;
  function dialog(html, { cls, label, color, lock, scroll, onClose } = {}) {
    if (current) current.close(true);
    const c = color || GREEN;
    const bd = document.createElement('div');
    bd.className = 'mp-bd';
    bd.innerHTML = `<div class="mp-card ${cls || ''}${isLight(c) ? ' mp-lt' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label || '')}" style="--mp:${c}">
      <button type="button" class="mp-x" aria-label="Đóng">${icon('x')}</button>${html}
      <div class="mp-scrollhint" aria-hidden="true"><span>Cuộn xuống để đọc hết &amp; đóng</span><i>${icon('arrow-down')}</i></div></div>`;
    const card = bd.querySelector('.mp-card'); const x = bd.querySelector('.mp-x'); const later = bd.querySelector('.mp-later');
    const cont = bd.querySelector('.mp-continue'); const contText = cont ? cont.textContent : '';
    const prevFocus = document.activeElement;
    let left = Math.max(0, Math.round(lock || 0)); let iv = 0;
    let read = !scroll;
    const blocked = () => left > 0 || !read;
    const close = (force) => {
      if (blocked() && force !== true) {
        nudge();
        if (!read && left <= 0) card.scrollBy({ top: Math.min(260, card.clientHeight * 0.6), behavior: 'smooth' });
        return;
      }
      if (!bd.isConnected || bd.classList.contains('out')) return;
      clearInterval(iv);
      bd.classList.add('out'); bd.classList.remove('in');
      window.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('mp-open');
      setTimeout(() => bd.remove(), 320);
      if (current && current.bd === bd) current = null;
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* bỏ qua */ }
    };
    const nudge = () => { x.classList.remove('mp-nudge'); void x.offsetWidth; x.classList.add('mp-nudge'); };
    const paint = () => {
      if (left > 0) {
        x.innerHTML = `<svg class="mp-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle class="p" cx="18" cy="18" r="15" style="stroke-dasharray:${RING.toFixed(1)};stroke-dashoffset:${(RING * (1 - left / lock)).toFixed(1)}"/></svg><b>${left}</b>`;
        x.setAttribute('aria-label', `Đóng được sau ${left} giây`); x.setAttribute('aria-disabled', 'true');
        if (later) later.textContent = `Đóng được sau ${left} giây`;
        if (cont) cont.querySelector('span').textContent = `Đọc thêm ${left} giây…`;
      } else if (!read) {
        x.innerHTML = icon('arrow-down', 'mp-down'); x.setAttribute('aria-label', 'Cuộn xuống hết để đóng'); x.setAttribute('aria-disabled', 'true');
        if (later) later.textContent = 'Cuộn xuống hết để đóng';
      } else {
        x.innerHTML = icon('x'); x.setAttribute('aria-label', 'Đóng'); x.removeAttribute('aria-disabled');
        if (later) later.textContent = 'Để sau';
        if (cont) cont.querySelector('span').textContent = contText;
        if (card.classList.contains('locked')) { card.classList.remove('locked'); card.classList.add('unlocked'); }
      }
      card.classList.toggle('need-scroll', !read);
      if (cont) cont.disabled = blocked();
    };
    if (blocked()) {
      card.classList.add('locked'); paint();
      if (left > 0) iv = setInterval(() => { if (document.hidden) return; left -= 1; paint(); if (left <= 0) clearInterval(iv); }, 1000);
    }
    const checkRead = () => {
      if (read) return;
      if (card.scrollTop + card.clientHeight >= card.scrollHeight - 24) { read = true; paint(); }
    };
    if (!read) { card.addEventListener('scroll', checkRead, { passive: true }); requestAnimationFrame(() => requestAnimationFrame(checkRead)); }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      // giữ Tab trong hộp thoại
      if (e.key === 'Tab') {
        const f = [...card.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    bd.addEventListener('click', (e) => {
      if (e.target === bd || e.target.closest('.mp-x, .mp-later, .mp-continue')) return close();
      if (e.target.closest('[data-close]')) close(true); // nút hành động chính luôn bấm được
    });
    // bắt phím trước mọi hộp thoại của trang: Esc chỉ tác động lên popup đang nằm trên cùng
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(bd);
    document.documentElement.classList.add('mp-open');
    requestAnimationFrame(() => bd.classList.add('in'));
    current = { bd, close };
    x.focus({ preventScroll: true });
    return { el: card, close };
  }

  // ---------- phần giới thiệu ----------
  function contactsHtml(b) {
    const list = [];
    if (b.phone) list.push(['tel:' + b.phone, 'phone', 'Gọi ' + b.phone.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3')]);
    if (b.zalo) list.push([zaloHref(b.zalo), 'chat', 'Zalo']);
    if (b.email) list.push(['mailto:' + b.email, 'mail', 'Email']);
    if (href(b.website)) list.push([b.website, 'globe', 'Website']);
    if (href(b.facebook)) list.push([b.facebook, 'facebook', 'Facebook']);
    return list.length ? `<div class="mp-contacts">${list.map(([h, ic, t]) => `<a href="${esc(h)}" target="_blank" rel="noopener">${icon(ic)}${esc(t)}</a>`).join('')}</div>` : '';
  }
  const logoHtml = (b) => (b.logo ? `<img class="mp-logo" src="${esc(b.logo)}" alt="" width="68" height="68">` : `<span class="mp-logo mp-logo-i">${icon('sparkles')}</span>`);
  function bodyHtml(b) {
    const cta = href(b.ctaUrl) || (b.zalo ? zaloHref(b.zalo) : b.phone ? 'tel:' + b.phone : ''); // link admin đặt → Zalo → gọi điện
    return `${b.about ? `<div class="mp-about">${rich(b.about)}</div>` : ''}
      ${(b.products || []).length ? `<div class="mp-sub">Sản phẩm &amp; dịch vụ nổi bật</div><ul class="mp-list">${b.products.map((p) => {
        const inner = `<span class="mp-ic">${icon(p.icon)}</span><span class="mp-tx"><b>${esc(p.name)}</b>${p.desc ? `<small>${esc(p.desc)}</small>` : ''}</span>`;
        return `<li>${href(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${inner}${icon('chevron', 'mp-go-i')}</a>` : `<div>${inner}</div>`}</li>`;
      }).join('')}</ul>` : ''}
      ${contactsHtml(b)}
      ${cta && b.ctaLabel ? `<a class="mp-cta" href="${esc(cta)}" target="_blank" rel="noopener">${icon('chat')}<span>${esc(b.ctaLabel)}</span></a>` : ''}`;
  }
  // ẩn lời mời tư vấn nhỏ ở góc (cùng nội dung) trong phiên này để không quảng cáo hai lần
  function hideNudge() {
    try { sessionStorage.setItem('mt-nudge-dismissed', '1'); } catch (e) { /* bỏ qua */ }
    // chỉ ẩn bằng class (không gỡ phần tử: mã của trang có thể vẫn tìm #nudge để bật / tắt)
    const n = document.getElementById('nudge');
    if (n) { n.hidden = true; n.classList.add('mp-hide'); }
  }

  // popup giới thiệu: dải đầu màu thương hiệu, logo lớn
  function show(b, o = {}) {
    if (!b) return null;
    const ctx = o.context || 'app';
    const kick = ctx === 'preview' ? 'Xem thử — người dùng bản miễn phí sẽ thấy'
      : o.gate ? `Đọc nhanh rồi ${o.action || 'tiếp tục'} nhé` : (o.kick || 'Bản miễn phí, đồng hành cùng');
    const foot = o.gate ? `<button type="button" class="mp-continue"><span>Tiếp tục ${esc(o.action || '')}</span>${icon('arrow-right')}</button>`
      : o.foot === false ? '<span></span>'
        : `<a href="${esc((o.foot && o.foot.href) || LANDING)}" target="_blank" rel="noopener">${esc((o.foot && o.foot.label) || 'Xem lộ trình học')} ${icon('arrow-right')}</a>`;
    const lock = o.lock != null ? o.lock : o.force ? 0 : lockOf(b);
    const d = dialog(`<div class="mp-hero mp-hero-b"><span class="mp-tag">${icon('gift')}${esc(kick)}</span>
        <div class="mp-brand">${logoHtml(b)}<div><b>${esc(b.name)}</b>${b.tagline ? `<small>${esc(b.tagline)}</small>` : ''}</div></div></div>
      <div class="mp-pad">${bodyHtml(b)}
        <div class="mp-foot${o.gate ? ' mp-foot-gate' : ''}">${foot}${o.gate ? '' : '<button type="button" class="mp-later">Để sau</button>'}</div></div>`,
    { label: 'Giới thiệu ' + b.name, color: colorOf(b), lock, scroll: !o.force && !o.gate && !!b.scrollClose && lock > 0,
      onClose: () => { if (ctx !== 'preview') markViewed(); if (o.onClose) o.onClose(); } });
    if (ctx !== 'preview') { hideNudge(); if (!o.force) mark(b.frequency, o.scope || 'brand'); }
    return d;
  }
  function schedule(b, o = {}) {
    if (!b || !b.enabled) return;
    if (!o.force && seen(b.frequency, o.scope || 'brand')) return;
    whenReady(() => show(b, o), (o.delay != null ? o.delay : Number(b.delay) || 0) * 1000, o.guard);
  }

  // ---------- thông báo chương trình miễn phí ----------
  // o: { title, text, perks: [..], cta: { label, href, onClick }, note }
  function announce(f, b, o = {}) {
    if (!f) return null;
    const clock = f.endsAt
      ? `<div class="mp-clock" aria-label="Thời gian còn lại">${['Ngày', 'Giờ', 'Phút', 'Giây'].map((u) => `<span><b>00</b><small>${u}</small></span>`).join('')}</div><div class="mp-until">Kết thúc lúc ${esc(ddmm(f.endsAt))}/${new Date(f.endsAt).getFullYear()}</div>`
      : '<div class="mp-until">Áp dụng đến khi chương trình kết thúc — nhanh tay kẻo lỡ</div>';
    const cta = o.cta || {};
    const about = b && b.enabled !== false
      ? `<div class="mp-sep"><span>Về ${esc(b.name)}</span></div><div class="mp-sponsor"><div class="mp-shead">${logoHtml(b)}<div><b>${esc(b.name)}</b>${b.tagline ? `<small>${esc(b.tagline)}</small>` : ''}</div></div>${bodyHtml(b)}</div>` : '';
    // pháo giấy nhỏ rơi trong dải đầu (CSS) — chỉ trang trí
    const confetti = Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 7.3 + 3) % 100}%;animation-delay:${(-i * 0.37).toFixed(2)}s;--h:${(i * 47) % 360}"></i>`).join('');
    const d = dialog(`<div class="mp-hero"><div class="mp-confetti" aria-hidden="true">${confetti}</div><span class="mp-gift" aria-hidden="true">${icon('gift')}</span>
        <span class="mp-tag">${icon('sparkles')}${esc(f.label || 'Chương trình mở miễn phí')}</span>
        <h2>${esc(o.title || 'Đang mở miễn phí')}</h2>
        ${o.text ? `<p>${esc(o.text)}</p>` : ''}${clock}</div>
      <div class="mp-pad">
        ${(o.perks || []).length ? `<ul class="mp-perks">${o.perks.map((p) => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('')}</ul>` : ''}
        <a class="mp-go" href="${esc(href(cta.href) || '#')}" data-close><span>${esc(cta.label || 'Dùng miễn phí ngay')}</span>${icon('arrow-right')}</a>
        ${o.note ? `<p class="mp-note">${esc(o.note)}</p>` : ''}
        ${about}
        <div class="mp-foot"><span></span><button type="button" class="mp-later">Để sau</button></div>
      </div>`, { cls: 'mp-ann', label: o.title || 'Chương trình miễn phí', color: colorOf(b), lock: o.force || !b ? 0 : lockOf(b), scroll: !o.force && !!b && b.scrollClose && lockOf(b) > 0,
      onClose: () => { if (b && b.enabled !== false) markViewed(); } });
    const go = d.el.querySelector('.mp-go');
    go.addEventListener('click', (e) => {
      if (!href(cta.href) || cta.href === '#') e.preventDefault();
      if (cta.onClick) cta.onClick(e);
    });
    if (f.endsAt) {
      const cells = d.el.querySelectorAll('.mp-clock b');
      const tick = () => {
        let s = Math.max(0, Math.floor((f.endsAt - Date.now()) / 1000));
        [86400, 3600, 60, 1].forEach((u, i) => { cells[i].textContent = two(Math.floor(s / u)); s %= u; });
        if (!d.el.isConnected) clearInterval(iv);
      };
      const iv = setInterval(tick, 1000); tick();
    }
    hideNudge();
    return d;
  }
  // mỗi chương trình (theo thời điểm bắt đầu + tên) chỉ tự hiện một lần mỗi phiên trình duyệt
  function scheduleAnnounce(f, b, o = {}) {
    if (!f) return;
    const scope = 'free_' + (f.startsAt || 0) + '_' + (f.label || '');
    if (!o.force && seen('session', scope)) return;
    whenReady(() => { if (current) return; announce(f, b, o); mark('session', scope); }, o.delay != null ? o.delay * 1000 : 1500, o.guard);
  }

  // ---------- dải thông báo đầu trang ----------
  // o: { text, onClick, onEnd, host } — đếm ngược tới lúc hết chương trình rồi tự gỡ
  function bar(f, o = {}) {
    if (!f) return null;
    const old = document.querySelector('.mp-bar');
    if (old) old.remove();
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'mp-bar';
    el.innerHTML = `${icon('gift')}<span class="mp-bar-t">${esc(o.text || f.label || 'Đang mở miễn phí')}</span><span class="mp-bar-c"></span><span class="mp-bar-go">Xem${icon('chevron')}</span>`;
    el.addEventListener('click', () => { if (o.onClick) o.onClick(); });
    const host = o.host || document.body;
    host.insertBefore(el, host.firstChild);
    const c = el.querySelector('.mp-bar-c');
    let iv = 0;
    const tick = () => {
      const s = Math.floor((f.endsAt - Date.now()) / 1000);
      if (s <= 0) { clearInterval(iv); el.remove(); if (o.onEnd) o.onEnd(); return; }
      const d = Math.floor(s / 86400);
      c.textContent = 'còn ' + (d ? d + ' ngày ' : '') + `${two(Math.floor(s % 86400 / 3600))}:${two(Math.floor(s % 3600 / 60))}:${two(s % 60)}`;
    };
    if (f.endsAt) { tick(); iv = setInterval(tick, 1000); }
    return el;
  }

  // dòng nhỏ "Bản miễn phí bởi …" — bấm để mở lại lời giới thiệu (tự bấm thì không bắt chờ)
  function chip(b, host, o = {}) {
    if (!b || !host) return null;
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'mp-chip';
    c.innerHTML = `${b.logo ? `<img src="${esc(b.logo)}" alt="" width="24" height="24">` : icon('sparkles')}<span>${esc(o.label || 'Đồng hành cùng')} <b>${esc(b.name)}</b></span>${icon('chevron')}`;
    c.onclick = () => show(b, Object.assign({}, o, { force: true }));
    host.appendChild(c);
    return c;
  }

  // ---------- xem xong mới tiếp tục (lưu thiệp, tải mã QR, sao chép kết quả…) ----------
  // Popup giới thiệu có đồng hồ đếm ngược b.gateSec giây; hết giờ nút "Tiếp tục …" mới bấm được, đóng popup = tiếp tục.
  // Đã xem lời giới thiệu trong khoảng tần suất b.gate (kể cả popup tự hiện) thì cho qua ngay. Trả về Promise.
  function gate(b, o = {}) {
    const freq = (b && b.gate) || 'off';
    if (!b || b.enabled === false || viewed(freq)) return Promise.resolve(true);
    return new Promise((resolve) => {
      show(b, Object.assign({}, o, { gate: true, force: false, lock: Math.max(1, Math.min(15, Number(b.gateSec) || 5)), onClose: () => resolve(true) }));
    });
  }
  // Gắn cho mọi nút có data-mp-gate="<việc>" (VD "sao chép kết quả"): chặn cú bấm đầu, hiện popup, xem xong thì bấm lại nút
  // đó giúp người dùng (vẫn trong cú bấm thật nên sao chép / tải về chạy bình thường). o.exempt() = true thì cho qua.
  let gating = false;
  function gateClicks(b, o = {}) {
    if (!b || gating) return;
    gating = true;
    let passing = false;
    document.addEventListener('click', (e) => {
      if (passing || !e.isTrusted) return;
      const t = e.target && e.target.closest && e.target.closest('[data-mp-gate]');
      if (!t || t.disabled || b.enabled === false || viewed(b.gate || 'off') || (o.exempt && o.exempt())) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (current) return;
      gate(b, { action: t.dataset.mpGate, scope: o.scope }).then(() => { passing = true; try { t.click(); } finally { passing = false; } });
    }, true);
  }

  // ---------- trang tĩnh: tự chạy theo thuộc tính của thẻ <script> ----------
  const me = document.currentScript;
  if (me && me.dataset.app) {
    const start = () => {
      const b = defaults(me.dataset.app, me.dataset.logo || '');
      if (me.dataset.delay) b.delay = Number(me.dataset.delay) || b.delay;
      const o = { kick: me.dataset.kick || 'Công cụ miễn phí, đồng hành cùng', scope: 'tool' };
      document.querySelectorAll('[data-mp-chip]').forEach((h) => chip(b, h, Object.assign({ label: 'Công cụ miễn phí, đồng hành cùng' }, o)));
      // data-gate: off | always | session | day (mặc định mỗi ngày) · data-gate-sec: số giây phải xem
      if (me.dataset.gate) b.gate = me.dataset.gate;
      if (me.dataset.gateSec) b.gateSec = Number(me.dataset.gateSec) || b.gateSec;
      gateClicks(b, { scope: 'tool' });
      if (/[?&#]mt-promo\b/.test(location.search + location.hash)) show(b, Object.assign({}, o, { force: true }));
      else schedule(b, o);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }

  return Object.assign(core, { show, schedule, announce, scheduleAnnounce, bar, chip, gate, gateClicks, viewed, isOpen: () => !!current });
});
