# ManhTool — Tạo mã QR chuyên nghiệp

Công cụ tạo mã QR có thiết kế riêng, kèm **mã QR động** (sửa đích đến sau khi in, xem thống kê lượt quét) để thu phí định kỳ.

## Tính năng

**Miễn phí, chạy hoàn toàn trên trình duyệt (mã tĩnh)**
- 11 loại nội dung: đường dẫn, văn bản, Wi-Fi, chuyển khoản **VietQR chuẩn NAPAS** (tự tạo, không gọi API ngoài), danh thiếp vCard, điện thoại, Zalo, tin nhắn, email, vị trí (Google Maps), sự kiện lịch.
- Thiết kế: 19 mẫu sẵn (Valentine, Sinh nhật, Thiệp cưới, Vé sự kiện, Polaroid, Lấp lánh…) + lưu mẫu riêng, màu / dải màu (thẳng, tỏa tròn), hình dáng mã (vuông, tròn, trái tim — phần trống rải chấm trang trí mờ), 12 kiểu chấm (có trái tim, ngôi sao, bông hoa, lấp lánh), 5 kiểu khung mắt, 5 kiểu lõi mắt (có bông hoa), màu mắt riêng, logo (tải ảnh hoặc 15 biểu tượng có sẵn, tự nâng mức sửa lỗi lên H), 8 kiểu khung (dải chữ, nhãn, bong bóng, thiệp, hộp quà, vé mời, polaroid), lề, mức sửa lỗi.
- Chọn chấm hình vui khi đang dùng kiểu mắt dễ làm mã đọc trượt thì tự đổi khung mắt sang "Bo góc" (hoàn tác được); ghép tay kiểu khó quét thì hiện cảnh báo.
- Tải PNG (512 → 4096 px), SVG (vector để in), JPG; chép ảnh vào bộ nhớ tạm; in.
- **Thử quét**: giải mã lại chính ảnh vừa thiết kế ở 2 cỡ để chắc chắn điện thoại đọc được; cảnh báo màu kém tương phản, đảo màu, lề hẹp, logo quá to.
- **Tạo hàng loạt**: mỗi dòng 1 mã (hoặc `tên file, nội dung`), mở file CSV/TXT, tải 1 file ZIP (PNG / SVG).
- **Đọc mã QR từ ảnh** (chọn, kéo thả, dán Ctrl+V): hiện rõ đường dẫn, thông tin chuyển khoản VietQR, mật khẩu Wi-Fi trước khi mở.

**Mã QR động (cần đăng nhập Google)**
- Mã chỉ chứa đường dẫn ngắn `SHORT_URL/q/<tên>`, đổi đích bất cứ lúc nào, có lịch sử đích cũ.
- Thống kê: lượt quét, người quét không trùng trong ngày, biểu đồ theo ngày (gộp theo tuần khi xem 1 năm), hệ điều hành, ứng dụng quét (Zalo, Facebook, Safari…), loại thiết bị, quốc gia (khi chạy sau Cloudflare), giờ trong ngày, 30 lượt gần nhất. Không lưu IP.
- Đích riêng cho iPhone / Android (mở App Store / Google Play), bật / tắt mã, thư mục, tìm kiếm.
- Gói Pro: tên đường dẫn riêng, mật khẩu, hẹn ngày tắt, giới hạn lượt quét, thống kê đến 400 ngày, xuất CSV.
- Hạn mức: miễn phí 3 mã, Pro 100 mã; giá Pro mặc định 29.000đ / tháng, 290.000đ / năm (đổi trong trang quản trị). Hết Pro: 3 ngày ân hạn, sau đó các mã mới nhất vượt hạn mức tạm dừng (người quét thấy trang thông báo), mã cũ vẫn chạy.

**Thu phí**: gói Pro 1 tháng / 12 tháng thanh toán bằng VietQR, SePay webhook tự cộng thời hạn (mua thêm khi còn hạn thì cộng nối tiếp, chuyển thiếu rồi chuyển bù vẫn được ghi nhận). Xem `PAYMENT-GUIDE.md`.

**Quản trị** (`/admin`): người dùng (tặng / bỏ Pro, khóa, quyền), **kiểm duyệt mã động** (tìm theo đích, khóa mã lừa đảo), **báo cáo vi phạm** từ người quét (khóa mã hoặc bỏ qua, có số đếm trên thẻ), đơn hàng + tiền chưa khớp + xác nhận tay, cài đặt Google / hạn mức / thanh toán, nhật ký.

**Trang phụ**: `/dieu-khoan` (điều khoản + biểu mẫu báo cáo mã QR lừa đảo, không cần đăng nhập), `/bao-mat` (chính sách bảo mật — Google yêu cầu khi duyệt màn hình đăng nhập OAuth), `robots.txt` + `sitemap.xml` dựng theo `PUBLIC_URL`, trang 404. Mục "Đọc mã QR từ ảnh" gặp mã động của chính máy chủ thì có nút "Báo cáo mã này". Phần mã tĩnh chạy được khi mất mạng (`public/sw.js`).

## Chạy

```bash
npm install        # chỉ để chạy test (jsQR); máy chủ không cần thư viện ngoài
cp .env.example .env
npm start          # http://localhost:5180
npm test           # test bộ mã hóa QR, vẽ, nội dung, máy chủ + kiểm tra cú pháp
npm run backup     # chép data/db.json vào data/backups/, giữ 14 bản
npm run scan-matrix  # thử quét mọi mẫu / kiểu chấm / mắt / hình / khung bằng jsQR trong Edge/Chrome chạy ngầm (Node 22+)
```

Mở file `public/index.html` trực tiếp (không máy chủ) vẫn tạo được mã tĩnh; phần mã động tự ẩn.

## Triển khai
- Đặt `NODE_ENV=production`, `PUBLIC_URL=https://…`, `JWT_SECRET` (≥ 32 ký tự), `PAYMENT_WEBHOOK_KEY`.
- `SHORT_URL`: nên dùng tên miền ngắn trỏ cùng máy chủ (ví dụ `https://mtqr.vn`). **Không đổi sau khi đã có người in mã.**
- Chạy sau Nginx / Cloudflare thì đặt `TRUST_PROXY=true`. Mẫu cấu hình sẵn trong `deploy/`:
  - `deploy/nginx.conf`: HTTPS cho cả tên miền chính và tên miền ngắn, không ghi log truy cập `/q/` (chính sách bảo mật cam kết không lưu IP người quét), ghi đè `X-Forwarded-For` để không giả được IP.
  - `deploy/maqr.service`: chạy bằng systemd, chỉ được ghi vào `data/`.
  - `deploy/backup.cron`: sao lưu `data/db.json` lúc 3h sáng mỗi ngày (`scripts/backup.js`, giữ 14 bản). Nên chép thêm `data/backups/` sang máy khác.
- Tên miền ngắn chỉ phục vụ `/q/…` và `/assets/`; mở trang khác trên đó sẽ chuyển (301) về `PUBLIC_URL`.
- Google Cloud Console → OAuth consent screen: điền trang chủ `PUBLIC_URL`, chính sách bảo mật `PUBLIC_URL/bao-mat`, điều khoản `PUBLIC_URL/dieu-khoan`.
- Đọc lại `public/dieu-khoan.html` và `public/bao-mat.html` trước khi chạy thật: đó là bản nháp theo đúng những gì mã nguồn đang làm, chủ dịch vụ cần duyệt các cam kết (hoàn tiền, khóa tài khoản…).

## Cấu trúc
```
public/                 trang (chỉ thư mục này được phục vụ ra ngoài)
  assets/js/qr-core.js    bộ mã hóa QR (ISO 18004, phiên bản 1–40, L/M/Q/H) — UMD, test được trong Node
  assets/js/qr-render.js  vẽ SVG theo thiết kế (chấm, mắt, logo, khung, dải màu)
  assets/js/payloads.js   nội dung từng loại mã (VietQR EMVCo + CRC, Wi-Fi, vCard, iCalendar…)
  assets/js/zip.js        đóng gói ZIP cho tạo hàng loạt
  assets/js/app.js        giao diện tạo mã · codes.js mã động · account.js · shop.js · admin.js
  assets/vendor/jsQR.js   bộ đọc mã (Apache-2.0), chỉ tải khi bấm "Thử quét" / đọc ảnh
  dieu-khoan.html, bao-mat.html  trang văn bản (page.js: nút sáng/tối + biểu mẫu báo cáo)
  sw.js                   chạy khi mất mạng; không bao giờ lưu /q/, /api/, /admin
server/                 Node không thư viện ngoài: config → lib → db → services → routes
  routes/redirect.js      /q/<tên>: ghi lượt quét rồi chuyển hướng
  routes/static.js        file tĩnh, robots.txt, sitemap.xml, trang 404
  services/codes.js       mã động, hạn mức, thống kê
  services/reports.js     báo cáo mã vi phạm (không lưu IP)
deploy/                 mẫu nginx, systemd, cron sao lưu
scripts/                kiểm tra cú pháp, sao lưu dữ liệu
tests/                  node:test
```
