# Hướng dẫn tích hợp Thanh toán Chuyển khoản VietQR & Webhook SePay (Chuẩn ManhTool)

Tài liệu này mô tả chi tiết toàn bộ kiến trúc và các bước xử lý thanh toán tự động qua **VietQR + SePay Webhook**. Các dự án sau trong hệ sinh thái ManhTool có thể sử dụng nguyên mẫu tài liệu và mã nguồn này để triển khai nhanh chóng, an toàn và chính xác.

---

## 1. Kiến trúc tổng quan (Architecture Overview)

```
[Khách hàng]
     │
     │ 1. Chọn gói / dịch vụ
     ▼
[Trình duyệt / Frontend] ──────── 2. POST /api/orders ────────► [Máy chủ Backend]
     │                                                                 │
     │                                                     3. Sinh mã đơn (VD: MTHG7X9K2A)
     │                                                        Lưu đơn ở trạng thái "pending"
     │ 4. Nhận thông tin đơn & URL ảnh VietQR                          │
     ▼                                                                 ▼
[Hiển thị Popup Quét QR] ◄── img.vietqr.io ── [VietQR API (Miễn phí, không cần token)]
     │
     │ (Khách quét mã bằng App ngân hàng / MoMo / ZaloPay)
     ▼
[Ngân hàng Việt Nam (NAPAS 247)]
     │
     │ Thông báo biến động số dư tức thì
     ▼
[Hệ thống SePay.vn]
     │
     │ 5. POST webhook (kèm Header Authorization: Apikey <KEY>)
     ▼
[Máy chủ Backend: /api/payments/webhook]
     │
     ├─► Xác thực API Key (timingSafeEqual)
     ├─► Chống trùng lặp giao dịch (Idempotency check txId)
     ├─► Tách mã đơn trong nội dung chuyển khoản (Regex)
     └─► Khớp số tiền >= giá gói ──► Cập nhật trạng thái "paid" & Kích hoạt dịch vụ
                                              ▲
[Trình duyệt Frontend] ─── 6. Poll mỗi 4s ────┘
     │
     ▼
Tự động chuyển màn hình "Đã mở khóa thành công!"
```

---

## 2. Quy trình chi tiết 5 bước

### Bước 1: Sinh mã đơn hàng và mã chuyển khoản duy nhất
- **Quy tắc đặt mã**: `[TIỀN_TỐ_DỰ_ÁN] + [6 KÝ TỰ NGẪU NHIÊN]`
- **Bảng ký tự an toàn**: Loại bỏ các ký tự dễ gây nhầm lẫn khi người dùng nhập tay: `0`, `O`, `1`, `I`.
  ```javascript
  const CODE_PREFIX = 'MTHG'; // Thay bằng tiền tố của dự án: MTQS, MTLC, ...
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  
  function makeCode() {
    const bytes = crypto.randomBytes(6);
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return CODE_PREFIX + s;
  }
  ```
- **Hàm bóc tách mã từ nội dung ngân hàng**: Ngân hàng thường tự chèn dấu cách, dấu gạch nối hoặc đổi chữ hoa/thường. Luôn chuẩn hóa trước khi regex:
  ```javascript
  const CODE_RE = new RegExp(CODE_PREFIX + '[' + CODE_ALPHABET + ']{6}');
  
  function findCode(text) {
    const norm = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = CODE_RE.exec(norm);
    return m ? m[0] : null;
  }
  ```

---

### Bước 2: Tạo link mã VietQR chính xác 100%

Dùng dịch vụ tạo ảnh VietQR nhanh của `img.vietqr.io` (miễn phí, không cần đăng ký tài khoản):

```
https://img.vietqr.io/image/<MÃ_NGÂN_HÀNG>-<SỐ_TÀI_KHOẢN>-compact2.png?amount=<SỐ_TIỀN>&addInfo=<NỘI_DUNG>&accountName=<TÊN_CHỦ_TK>
```

#### ⚠️ LƯU Ý SỐNG CÒN VỀ MÃ NGÂN HÀNG (Tránh lỗi 404):
VietQR **chỉ chấp nhận mã chuẩn** theo quy định NAPAS. Ví dụ:
- **MBBank (Quân Đội)**: Mã chuẩn là **`MB`** (hoặc BIN `970422`). **TUYỆT ĐỐI KHÔNG DÙNG `MBB`** (sẽ bị lỗi 404 làm vỡ ảnh QR).
- **Techcombank**: `TCB`
- **Vietcombank**: `VCB`
- **VietinBank**: `ICB`
- **VPBank**: `VPB`
- **ACB**: `ACB`
- **TPBank**: `TPB`

#### Bộ lọc chuẩn hóa tự động (Bắt buộc dùng):
```javascript
const BANK_ALIASES = {
  'MBB': 'MB',
  'MBBANK': 'MB',
  'TECHCOMBANK': 'TCB',
  'VIETCOMBANK': 'VCB',
  'VIETINBANK': 'ICB',
  'VTB': 'ICB',
  'VPBANK': 'VPB',
  'TPBANK': 'TPB',
  'SACOMBANK': 'STB',
  'HDBANK': 'HDB',
  'AGRIBANK': 'VBA',
  'AGRI': 'VBA'
};

function cleanBankId(id) {
  const k = String(id || '').trim().toUpperCase();
  return BANK_ALIASES[k] || k;
}

function generateVietQRUrl({ bankId, accountNo, accountName, amount, content }) {
  const bank = cleanBankId(bankId);
  return 'https://img.vietqr.io/image/' + encodeURIComponent(bank) + '-' + encodeURIComponent(accountNo) + '-compact2.png?' +
    new URLSearchParams({
      amount: String(amount),
      addInfo: content,
      accountName: accountName
    }).toString();
}
```

---

### Bước 3: Giao diện thanh toán & Polling (Frontend)

1. **Hiển thị đầy đủ thông tin**:
   - Ảnh QR Code lớn (rõ nét).
   - Tên ngân hàng, số tài khoản, tên chủ thẻ, số tiền.
   - Mã nội dung chuyển khoản in đậm nổi bật.
   - Các nút **Sao chép nhanh** (Copy) cạnh số tài khoản, số tiền và nội dung để người dùng bấm chuyển khoản trên app ngân hàng nếu không quét được QR.
   - Bộ đếm ngược thời gian (thường là 30 phút).
2. **Cơ chế Polling**:
   - Khi modal mở, gọi `setInterval` kiểm tra `/api/orders/:orderId` mỗi **3 đến 4 giây**.
   - Khi API trả về `status: "paid"`, dừng polling, hiển thị hiệu ứng thành công và mở khóa tính năng.
   - Khi modal đóng hoặc hết giờ, gọi `clearInterval` để tránh tốn tài nguyên.

---

### Bước 4: Xử lý Webhook SePay (Backend)

#### 1. Cấu hình trên Dashboard SePay (sepay.vn):
- Vào mục **Tích hợp Webhook** -> **Thêm Webhook**.
- **URL Webhook**: `https://<ten-mien-cua-ban>/api/payments/webhook`
- **Phương thức**: `POST`
- **Kiểu xác thực**: `API Key`
- **Khóa API Key**: Đặt chuỗi ngẫu nhiên dài >= 32 ký tự (lưu vào biến môi trường `PAYMENT_WEBHOOK_KEY`).

#### 2. Định dạng dữ liệu SePay gửi về:
```json
{
  "id": 123456,
  "gateway": "MBBank",
  "transactionDate": "2026-10-17 17:05:00",
  "accountNumber": "0352593469",
  "subAccount": null,
  "transferType": "in",
  "transferAmount": 9000,
  "accumulated": 109000,
  "code": "MTHG7X9K2A",
  "content": "MTHG7X9K2A chuyen tien",
  "referenceCode": "MB123456789"
}
```

#### 3. Bộ lọc kiểm tra Webhook an toàn (Security Checklist):
1. **Kiểm tra Header xác thực** (Chấp nhận `Authorization: Apikey <KEY>` hoặc `Bearer <KEY>` hoặc `x-api-key`):
   ```javascript
   function webhookKeyOk(req, key) {
     if (!key) return false;
     const h = String(req.headers.authorization || '').trim();
     const x = String(req.headers['x-api-key'] || '').trim();
     let token = x;
     if (!token) {
       const m = /^(?:Apikey|Bearer)\s+(.+)$/i.exec(h);
       token = m ? m[1].trim() : (h === key ? h : '');
     }
     if (!token) return false;
     const a = crypto.createHash('sha256').update(token).digest();
     const b = crypto.createHash('sha256').update(key).digest();
     return crypto.timingSafeEqual(a, b);
   }
   ```
2. **Kiểm tra Idempotency (Tránh cộng tiền 2 lần)**:
   - Dùng mã giao dịch `body.id` (hoặc `body.referenceCode`) làm khóa.
   - Nếu `payments[txId]` đã tồn tại, phản hồi ngay `{ success: true, result: 'duplicate' }` mà không cộng lại.
3. **Chỉ nhận tiền vào**: Bỏ qua nếu `body.transferType !== 'in'`.
4. **Kiểm tra số tiền**:
   - Số tiền chuyển phải `>= order.amount`.
   - Nếu chuyển thiếu: Ghi nhận trạng thái `underpaid` và cộng dồn số tiền đã trả.
5. **Đơn quá hạn hoặc đơn đã bấm hủy**:
   - Trong vòng 7 ngày kể từ lúc tạo đơn (`LATE_ACCEPT_MS`), nếu tiền về đúng mã và đủ tiền, hệ thống **vẫn mở khóa cho khách hàng**.
6. **Phản hồi cho SePay**:
   - Luôn trả về `HTTP 200` với `{ success: true }` để SePay xác nhận đã gửi thành công và không gửi lại.

---

### Bước 5: Dự phòng & Quản trị (Admin Fallback)

Trong thực tế sẽ có khách hàng:
1. Quên không ghi nội dung chuyển khoản.
2. Gõ sai mã đơn hàng.
3. SePay hoặc ngân hàng bị trễ thông báo số dư.

**Giải pháp bắt buộc phải có trong trang Quản trị (Admin Panel)**:
- Danh sách lịch sử đơn hàng kèm trạng thái (`pending`, `paid`, `cancelled`, `expired`).
- Nút **"Xác nhận thủ công" (Manual Fulfill)**: Cho phép admin kiểm tra sao kê ngân hàng và bấm kích hoạt gói ngay cho khách hàng chỉ với 1 click.
- Danh sách giao dịch chưa khớp đơn (`unmatched payments`) để admin dễ dàng đối soát khi khách liên hệ hỗ trợ.

---

## 3. Checklist triển khai dự án mới

- [ ] Tạo bảng / collection lưu trữ `orders` và `payments`
- [ ] Cấu hình biến môi trường `PAYMENT_WEBHOOK_KEY` trong file `.env`
- [ ] Bật `media-src` và `img-src https://img.vietqr.io` trong Content Security Policy (CSP)
- [ ] Thêm route `POST /api/orders` (tạo đơn)
- [ ] Thêm route `GET /api/orders/:id` (polling trạng thái đơn)
- [ ] Thêm route `POST /api/payments/webhook` (nhận webhook SePay)
- [ ] Thêm chức năng xác nhận đơn thủ công trong Admin
- [ ] Thử nghiệm quét thanh toán thật 1.000đ - 10.000đ để xác nhận toàn bộ quy trình hoạt động trơn tru.
