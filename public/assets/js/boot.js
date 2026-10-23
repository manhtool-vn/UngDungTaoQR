/* Chạy sớm trong <head> để áp nền sáng/tối đã chọn trước khi trang hiện ra (tránh nháy màu).
   Để trong file riêng thay vì script inline, nhờ vậy CSP chỉ cần cho phép script của chính trang. */
try { var t = localStorage.getItem('mt-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
