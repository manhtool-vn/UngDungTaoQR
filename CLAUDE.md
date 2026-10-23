# ManhTool — Quy tắc chung cho mọi công cụ

Mỗi thư mục con là một công cụ thuộc kho **ManhTool** — https://manhtool.id.vn.
Thông tin thương hiệu gốc: `brand/# ManhTool — Kho công cụ trực tuyến.txt`. Quy tắc giao diện, câu chữ, icon, bố cục, kiểm thử chung: xem `../ThoiGianDemNguoc/CLAUDE.md` (cùng bộ quy tắc).

## Riêng công cụ này (Tạo mã QR chuyên nghiệp)
- `public/` là toàn bộ trang (chỉ thư mục này được phục vụ ra ngoài); `server/` là máy chủ Node không thư viện ngoài
  (config → lib → db → services → routes); `brand/` là ảnh gốc; `data/` và `.env` không bao giờ đưa lên git.
- Mã tĩnh tạo hoàn toàn trên trình duyệt: `qr-core.js` (mã hóa) → `qr-render.js` (SVG theo thiết kế) → PNG qua canvas.
  Các file này và `payloads.js`, `zip.js` là UMD không đụng DOM để test trong Node.
- Mã động: `/q/<slug>` (routes/redirect.js) ghi lượt quét bằng `db.saveSoon()` (gộp ghi file) rồi 302 sang đích.
  `SHORT_URL` in vào mã — không bao giờ đổi đường dẫn `/q/` vì mã đã in sẽ hỏng.
- Ô căn chỉnh (alignment) và mắt định vị luôn vẽ liền khối: vẽ bằng chấm rời làm máy quét không tìm ra khi ảnh lớn.
  Mỗi khi thêm kiểu chấm / mắt / hình / khung hay mẫu sẵn: chạy `npm run scan-matrix` (giải mã PNG ở 360 / 640 / 1000 px, cả bản hơi nhòe,
  bằng jsQR trong Edge/Chrome chạy ngầm); mọi mẫu sẵn phải đạt 15/15. Đã thử và loại: lõi mắt kim cương / trái tim / ngôi sao, khung mắt trái tim
  (máy đọc tính sai tâm mắt). Chấm hình vui + khung mắt chuỗi hạt, hoặc + lõi hoa trong khung vuông / lá cũng đọc trượt → `riskyEyes()` cảnh báo.
- Nhiều SVG nằm chung một trang (ảnh thu nhỏ các mẫu): mỗi ảnh phải có id dải màu riêng, trùng id thì ảnh sau mượn nhầm màu của ảnh trước.
- Đăng nhập: Google OAuth (PKCE) → JWT trong cookie HttpOnly `mq_at` + refresh `mq_rt`. Thao tác ghi phải kèm `X-Requested-With: maqr`.
- Thanh toán gói Pro: mã đơn `MTQR` + 6 ký tự, xem `PAYMENT-GUIDE.md`.
- CSP chặn script inline: không viết `<script>…</script>` hay `onclick=` trong HTML.
- `public/sw.js`: thêm / đổi tên file trong `public/` thì sửa danh sách `SHELL` (thiếu 1 file là cài đặt hỏng cả bộ) và tăng `VERSION`.
- Điều khoản / bảo mật (`dieu-khoan.html`, `bao-mat.html`) mô tả đúng những gì máy chủ lưu: đổi cách lưu dữ liệu thì sửa cả 2 trang.
- Kiểm thử: `npm test`.
