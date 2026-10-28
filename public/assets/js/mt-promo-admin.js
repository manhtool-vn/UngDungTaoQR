/* ManhTool — tab quản trị "Miễn phí & giới thiệu" (dùng chung cho các dự án có thu phí; cần mt-promo.js nạp trước).
   Cùng một file ở mọi dự án — sửa ở đây thì chép lại sang các dự án khác.
   MTPromoAdmin.mount(el, {
     base,        // MTPromo.defaults(app, logo) — nội dung mặc định của dự án
     features,    // [{ key, label, hint }] — các quyền lợi có thể mở miễn phí
     keepLabel,   // chữ cho ô "giữ vĩnh viễn" (mỗi dự án giữ một thứ khác nhau)
     where,       // [chuỗi] — nơi người dùng thấy chương trình / popup
     load(),      // → { free, running, brand, stats: [{ label, value }] }
     saveFree(f), // f = null để tắt → như load()
     saveBrand(b),// → { brand }
     announce(f, brand), // xem thử thông báo đúng như người dùng thấy
     toast(msg, err)
   }) */
(function () {
  const P = window.MTPromo;
  const esc = P.esc;
  const two = (n) => String(n).padStart(2, '0');
  const toLocal = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`; };
  const fromLocal = (v) => { const t = v ? new Date(v).getTime() : 0; return Number.isFinite(t) ? t : 0; };
  const fmt = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
  const left = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(s / 86400); const h = Math.floor(s % 86400 / 3600); const m = Math.floor(s % 3600 / 60);
    return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : `${m} phút`;
  };
  const ICON_LABEL = {
    gift: 'Quà', alarm: 'Đồng hồ báo thức', note: 'Ghi chú khoá', qr: 'Mã QR', calendar: 'Lịch', shuffle: 'Ngẫu nhiên', grid: 'Lưới công cụ',
    sparkles: 'Lấp lánh', code: 'Lập trình', phone: 'Điện thoại', smartphone: 'Ứng dụng di động', chat: 'Tin nhắn', mail: 'Thư', globe: 'Website',
    facebook: 'Facebook', graduation: 'Mũ tốt nghiệp', megaphone: 'Loa quảng cáo', heart: 'Trái tim', star: 'Ngôi sao', crown: 'Vương miện',
    lock: 'Ổ khoá', key: 'Chìa khoá', shield: 'Khiên', music: 'Âm nhạc', image: 'Hình ảnh', palette: 'Bảng màu', link: 'Liên kết', text: 'Chữ',
    search: 'Tìm kiếm', users: 'Mọi người', zap: 'Tia chớp', book: 'Sách', clock: 'Đồng hồ',
  };
  const FREQ = [['always', 'Mỗi lần mở trang'], ['session', 'Mỗi phiên trình duyệt'], ['day', 'Mỗi ngày một lần']];

  function mount(el, o) {
    let state = { free: null, running: false, brand: null, stats: [] };
    const features = o.features || [];

    function statusHtml() {
      const f = state.free; const now = Date.now();
      if (!f || !f.active) return '<span class="mpa-pill">Đang tắt</span>';
      if (f.endsAt && f.endsAt <= now) return '<span class="mpa-pill">Đã kết thúc</span>';
      if (f.startsAt && f.startsAt > now) return `<span class="mpa-pill mpa-wait">Đã hẹn · bắt đầu ${esc(fmt(f.startsAt))}</span>`;
      return `<span class="mpa-pill mpa-on">Đang chạy${f.endsAt ? ' · còn ' + esc(left(f.endsAt - now)) : ''}</span>`;
    }

    function render() {
      const f = state.free || { features: features.map((x) => x.key), label: '', startsAt: 0, endsAt: 0, keep: true, active: false };
      const b = state.brand || P.normalizeBrand(o.base, o.base);
      el.innerHTML = `<div class="mpa">
        <section class="mpa-sec">
          <div class="mpa-h"><h3>${P.icon('gift')}Mở miễn phí</h3>${statusHtml()}</div>
          <p class="mpa-desc">Khi ít người mua: mở miễn phí các quyền lợi trả phí trong một khoảng thời gian. Mọi trang tự hiện thông báo một lần mỗi phiên kèm đồng hồ đếm ngược, đầu trang có dải xanh. Đổi lại, người dùng bản miễn phí thấy lời giới thiệu ngắn của đơn vị đồng hành.</p>
          ${state.stats && state.stats.length ? `<div class="mpa-stats">${state.stats.map((s) => `<div><b>${esc(s.value)}</b><small>${esc(s.label)}</small></div>`).join('')}</div>` : ''}
          <form class="mpa-form" data-f="free">
            <fieldset class="mpa-feat"><legend>Mở miễn phí</legend>
              ${features.map((x) => `<label class="mpa-check"><input type="checkbox" name="features" value="${esc(x.key)}"${f.features.includes(x.key) ? ' checked' : ''}><span><b>${esc(x.label)}</b>${x.hint ? `<small>${esc(x.hint)}</small>` : ''}</span></label>`).join('')}
            </fieldset>
            <label class="mpa-field"><span>Tên chương trình</span><input name="label" maxlength="60" value="${esc(f.label)}" placeholder="Ví dụ: Mừng khai trương — mở Pro miễn phí"></label>
            <div class="mpa-row">
              <label class="mpa-field"><span>Bắt đầu <small>(trống = ngay bây giờ)</small></span><input type="datetime-local" name="startsAt" value="${toLocal(f.startsAt)}"></label>
              <label class="mpa-field"><span>Kết thúc <small>(trống = đến khi tắt)</small></span><input type="datetime-local" name="endsAt" value="${toLocal(f.endsAt)}"></label>
            </div>
            <div class="mpa-quick"><span>Chọn nhanh:</span>${[3, 7, 14, 30].map((n) => `<button type="button" class="mpa-btn mpa-sm" data-days="${n}">${n} ngày</button>`).join('')}</div>
            <p class="mpa-err" data-err hidden></p>
            <label class="mpa-check"><input type="checkbox" name="keep"${f.keep ? ' checked' : ''}><span><b>Giữ vĩnh viễn</b><small>${esc(o.keepLabel || 'Những gì nhận được trong thời gian miễn phí được giữ lại sau khi chương trình kết thúc')}</small></span></label>
            <div class="mpa-actions">
              <button type="submit" class="mpa-btn mpa-primary">${state.free && state.free.active ? 'Lưu thay đổi' : 'Bật chương trình'}</button>
              <button type="button" class="mpa-btn" data-act="ann">${P.icon('sparkles')}Xem thử thông báo</button>
              ${state.free ? '<button type="button" class="mpa-btn mpa-danger" data-act="off">Tắt chương trình</button>' : ''}
            </div>
          </form>
          ${(o.where || []).length ? `<div class="mpa-where"><b>Người dùng sẽ thấy ở đâu</b><ol>${o.where.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></div>` : ''}
        </section>

        <section class="mpa-sec">
          <div class="mpa-h"><h3>${P.icon('megaphone')}Lời giới thiệu (popup quảng bá)</h3>${b.enabled ? '<span class="mpa-pill mpa-on">Đang bật</span>' : '<span class="mpa-pill">Đang tắt</span>'}</div>
          <p class="mpa-desc">Hiện cho người dùng bản miễn phí (khách và tài khoản chưa trả tiền) sau vài giây, theo tần suất bên dưới. Tài khoản đã trả tiền và quản trị viên không bị tự hiện.</p>
          <form class="mpa-form" data-f="brand">
            <label class="mpa-check"><input type="checkbox" name="enabled"${b.enabled ? ' checked' : ''}><span><b>Bật popup giới thiệu</b></span></label>
            <div class="mpa-row">
              <label class="mpa-field"><span>Tên thương hiệu</span><input name="name" maxlength="60" value="${esc(b.name)}"></label>
              <label class="mpa-field"><span>Khẩu hiệu</span><input name="tagline" maxlength="120" value="${esc(b.tagline)}"></label>
            </div>
            <label class="mpa-field"><span>Logo <small>(đường dẫn ảnh trong trang, ví dụ ${esc(o.base.logo || '/assets/img/logo.png')})</small></span><input name="logo" maxlength="200" value="${esc(b.logo)}"></label>
            <div class="mpa-field"><span>Giới thiệu <small class="mpa-count" data-count></small></span>
              <div class="mpa-edit"><textarea name="about" maxlength="1500" rows="10">${esc(b.about)}</textarea><div class="mp-pv mpa-pv" style="--mp:${esc(b.color)}"><small>Xem trước</small><div class="mp-about" data-pv></div></div></div>
              <small class="mpa-help">**chữ** để tô nổi bật · dòng trống để tách đoạn · dòng bắt đầu bằng "- " thành danh sách · :graduation: :heart: :star: … để chèn icon</small>
            </div>
            <div class="mpa-field"><span>Sản phẩm &amp; dịch vụ <small>(tối đa 6)</small></span><div class="mpa-prods" data-prods></div>
              <button type="button" class="mpa-btn mpa-sm" data-act="addp">Thêm sản phẩm</button></div>
            <div class="mpa-row mpa-row3">
              <label class="mpa-field"><span>Điện thoại</span><input name="phone" value="${esc(b.phone)}"></label>
              <label class="mpa-field"><span>Zalo</span><input name="zalo" value="${esc(b.zalo)}"></label>
              <label class="mpa-field"><span>Email</span><input name="email" value="${esc(b.email)}"></label>
            </div>
            <div class="mpa-row">
              <label class="mpa-field"><span>Website</span><input name="website" value="${esc(b.website)}"></label>
              <label class="mpa-field"><span>Facebook</span><input name="facebook" value="${esc(b.facebook)}"></label>
            </div>
            <div class="mpa-row">
              <label class="mpa-field"><span>Chữ trên nút chính</span><input name="ctaLabel" maxlength="40" value="${esc(b.ctaLabel)}"></label>
              <label class="mpa-field"><span>Link nút chính <small>(trống = mở Zalo)</small></span><input name="ctaUrl" value="${esc(b.ctaUrl)}"></label>
            </div>
            <div class="mpa-row mpa-row4">
              <label class="mpa-field"><span>Hiện sau (giây)</span><input type="number" name="delay" min="0" max="300" value="${b.delay}"></label>
              <label class="mpa-field"><span>Bao lâu hiện lại</span><select name="frequency">${FREQ.map(([k, t]) => `<option value="${k}"${b.frequency === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="mpa-field"><span>Chờ mới cho đóng (giây)</span><input type="number" name="lock" min="0" max="15" value="${b.lock}"></label>
              <label class="mpa-field"><span>Màu chủ đạo</span><input type="color" name="color" value="${esc(b.color)}"></label>
            </div>
            <label class="mpa-check"><input type="checkbox" name="scrollClose"${b.scrollClose ? ' checked' : ''}><span><b>Phải cuộn xuống hết mới đóng được</b><small>Chỉ áp dụng khi có đặt thời gian chờ</small></span></label>
            <div class="mpa-actions">
              <button type="submit" class="mpa-btn mpa-primary">Lưu lời giới thiệu</button>
              <button type="button" class="mpa-btn" data-act="pv">${P.icon('sparkles')}Xem thử popup</button>
              <button type="button" class="mpa-btn" data-act="sug">Điền nội dung gợi ý</button>
            </div>
          </form>
        </section>
      </div>`;
      renderProds(b.products);
      bind();
      preview();
    }

    const prodsBox = () => el.querySelector('[data-prods]');
    function renderProds(list) {
      prodsBox().innerHTML = list.map((p) => `<div class="mpa-prow">
          <label class="mpa-icsel"><span class="mpa-icv">${P.icon(p.icon)}</span><select data-k="icon" aria-label="Biểu tượng">${P.ICON_NAMES.map((n) => `<option value="${n}"${p.icon === n ? ' selected' : ''}>${esc(ICON_LABEL[n] || n)}</option>`).join('')}</select></label>
          <input data-k="name" maxlength="60" placeholder="Tên sản phẩm" value="${esc(p.name)}">
          <input data-k="url" placeholder="https://…" value="${esc(p.url)}">
          <button type="button" class="mpa-btn mpa-sm mpa-danger" data-del aria-label="Xoá sản phẩm">${P.icon('x')}</button>
          <input data-k="desc" maxlength="160" placeholder="Mô tả ngắn" value="${esc(p.desc)}">
        </div>`).join('');
      el.querySelector('[data-act="addp"]').hidden = list.length >= 6;
    }
    const readProds = () => [...prodsBox().querySelectorAll('.mpa-prow')].map((r) => {
      const o2 = {}; r.querySelectorAll('[data-k]').forEach((i) => { o2[i.dataset.k] = i.value; }); return o2;
    });
    function readBrand() {
      const f = el.querySelector('[data-f="brand"]');
      const g = (n) => f.elements[n];
      return P.normalizeBrand({
        enabled: g('enabled').checked, name: g('name').value, tagline: g('tagline').value, logo: g('logo').value, about: g('about').value,
        phone: g('phone').value, zalo: g('zalo').value, email: g('email').value, website: g('website').value, facebook: g('facebook').value,
        ctaLabel: g('ctaLabel').value, ctaUrl: g('ctaUrl').value, delay: g('delay').value, frequency: g('frequency').value, lock: g('lock').value,
        color: g('color').value, scrollClose: g('scrollClose').checked, products: readProds(),
      }, o.base);
    }
    function readFree() {
      const f = el.querySelector('[data-f="free"]');
      return {
        active: true, features: [...f.querySelectorAll('[name="features"]:checked')].map((i) => i.value), label: f.elements.label.value.trim(),
        startsAt: fromLocal(f.elements.startsAt.value), endsAt: fromLocal(f.elements.endsAt.value), keep: f.elements.keep.checked,
      };
    }
    function preview() {
      const f = el.querySelector('[data-f="brand"]');
      const t = f.elements.about.value;
      el.querySelector('[data-pv]').innerHTML = P.rich(t);
      el.querySelector('.mpa-pv').style.setProperty('--mp', f.elements.color.value);
      const c = el.querySelector('[data-count]');
      c.textContent = `${t.length}/1500`;
      c.classList.toggle('warn', t.length > 1350);
    }
    function showErr(msg) {
      const e = el.querySelector('[data-err]');
      e.textContent = msg || ''; e.hidden = !msg;
    }

    function bind() {
      const ff = el.querySelector('[data-f="free"]');
      const fb = el.querySelector('[data-f="brand"]');
      const check = () => showErr(P.freeError(readFree(), features.map((x) => x.key)));
      ff.addEventListener('input', check);
      ff.addEventListener('change', check);
      ff.querySelectorAll('[data-days]').forEach((btn) => btn.addEventListener('click', () => {
        const d = new Date(); d.setDate(d.getDate() + Number(btn.dataset.days)); d.setHours(23, 59, 0, 0);
        ff.elements.startsAt.value = ''; ff.elements.endsAt.value = toLocal(d.getTime()); check();
      }));
      ff.addEventListener('submit', async (e) => {
        e.preventDefault();
        const free = readFree(); const err = P.freeError(free, features.map((x) => x.key));
        if (err) { showErr(err); return; }
        try { Object.assign(state, await o.saveFree(free)); render(); o.toast('Đã lưu chương trình miễn phí'); } catch (er) { o.toast(er.message || 'Không lưu được', true); }
      });
      el.querySelector('[data-act="ann"]').addEventListener('click', () => {
        const free = Object.assign(readFree(), { active: true });
        if (!free.endsAt || free.endsAt <= Date.now()) free.endsAt = Date.now() + 7 * 86400e3;
        if (!free.features.length) free.features = features.map((x) => x.key);
        o.announce(free, readBrand());
      });
      const off = el.querySelector('[data-act="off"]');
      if (off) off.addEventListener('click', async () => {
        if (!confirm('Tắt chương trình miễn phí ngay bây giờ?')) return;
        try { Object.assign(state, await o.saveFree(null)); render(); o.toast('Đã tắt chương trình miễn phí'); } catch (er) { o.toast(er.message || 'Không tắt được', true); }
      });

      fb.addEventListener('input', (e) => { if (e.target.name === 'about' || e.target.name === 'color') preview(); });
      prodsBox().addEventListener('change', (e) => {
        const s = e.target.closest('select[data-k="icon"]');
        if (s) s.parentElement.querySelector('.mpa-icv').innerHTML = P.icon(s.value);
      });
      prodsBox().addEventListener('click', (e) => {
        const d = e.target.closest('[data-del]');
        if (!d) return;
        d.closest('.mpa-prow').remove();
        el.querySelector('[data-act="addp"]').hidden = readProds().length >= 6;
      });
      el.querySelector('[data-act="addp"]').addEventListener('click', () => {
        const list = readProds(); if (list.length >= 6) return;
        list.push({ icon: 'sparkles', name: '', desc: '', url: '' }); renderProds(list);
        const rows = prodsBox().querySelectorAll('.mpa-prow'); rows[rows.length - 1].querySelector('[data-k="name"]').focus();
      });
      el.querySelector('[data-act="pv"]').addEventListener('click', () => P.show(readBrand(), { context: 'preview' }));
      el.querySelector('[data-act="sug"]').addEventListener('click', () => {
        const s = o.base;
        ['name', 'tagline', 'about', 'ctaLabel', 'logo', 'website', 'email', 'color'].forEach((k) => { if (s[k] != null) fb.elements[k].value = s[k]; });
        renderProds(s.products); preview();
        o.toast('Đã điền nội dung gợi ý — bấm Lưu để áp dụng');
      });
      fb.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { const r = await o.saveBrand(readBrand()); state.brand = r.brand; render(); o.toast('Đã lưu lời giới thiệu'); } catch (er) { o.toast(er.message || 'Không lưu được', true); }
      });
    }

    el.innerHTML = '<p class="mpa-desc">Đang tải…</p>';
    return o.load().then((r) => { Object.assign(state, r); render(); }).catch((er) => { el.innerHTML = `<p class="mpa-err">${esc(er.message || 'Không tải được')}</p>`; });
  }

  window.MTPromoAdmin = { mount };
})();
