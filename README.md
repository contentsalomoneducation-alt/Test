# Thuế Tháng

Ứng dụng tính thuế TNCN hàng tháng (tiền lương, tiền công) có tài khoản người dùng và lịch sử lưu trên máy chủ.

- Tính thuế theo biểu 5 bậc, giảm trừ bản thân / người phụ thuộc, bảo hiểm bắt buộc có trần.
- Đăng ký, đăng nhập, lưu thuế từng tháng, xem lại trên mọi thiết bị, biểu đồ theo năm, xuất CSV.
- Mỗi người tự chỉnh mức giảm trừ và trần bảo hiểm khi quy định thay đổi.
- Không cần cài thư viện: chỉ cần **Node.js >= 22.13** (dùng sẵn `node:sqlite`).

## Chạy trên máy

```bash
npm start            # http://localhost:3000
npm test             # chạy bộ kiểm thử
```

Biến môi trường (đều không bắt buộc):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng lắng nghe |
| `DATA_DIR` | `./data` | Thư mục chứa file CSDL `app.db` |
| `NODE_ENV` | | Đặt `production` để cookie phiên luôn có cờ `Secure` |
| `TRUST_PROXY` | | Đặt `1` khi chạy sau proxy (Render, Railway, Nginx…) để giới hạn số lần thử theo IP thật |

## Triển khai

Đây là ứng dụng có backend nên **không chạy được trên GitHub Pages**. Cần một nơi chạy Node.js và **ổ đĩa lưu trữ bền vững** cho `DATA_DIR`, nếu không dữ liệu sẽ mất mỗi lần khởi động lại.

Ví dụ với Render / Railway / Fly.io (dùng `Dockerfile` có sẵn):

1. Tạo dịch vụ web từ repo này, chọn Docker.
2. Gắn một persistent disk vào đường dẫn `/data`.
3. Đặt `NODE_ENV=production` và `TRUST_PROXY=1`.

## Bảo mật

- Mật khẩu băm bằng scrypt kèm salt riêng; phiên là token ngẫu nhiên, chỉ lưu bản băm SHA-256 trong CSDL.
- Cookie `HttpOnly` + `SameSite=Lax`; API ghi dữ liệu chỉ nhận `application/json`.
- Giới hạn số lần đăng nhập / đăng ký sai; giới hạn kích thước body; có CSP và chặn truy cập ngoài thư mục `public/`.
- Máy chủ tự tính lại thuế khi lưu, không tin số liệu kết quả do trình duyệt gửi lên.
- Mỗi người chỉ đọc / sửa / xóa được dữ liệu của mình.

## Cấu trúc

```
server.js        API + phục vụ file tĩnh (http, crypto, node:sqlite)
public/tax.js    logic tính thuế, dùng chung cho trình duyệt và máy chủ
public/          giao diện (index.html, app.js, style.css)
test/            kiểm thử API
```

Các mức giảm trừ và trần bảo hiểm mặc định nằm ở `public/tax.js` (`DEFAULT_SETTINGS`). Kết quả chỉ mang tính tham khảo.
