# +1 Speed Keyboard Escape (bản mô phỏng trên trình duyệt)

Bản làm lại (fan-made) của game Roblox **+1 Speed Keyboard Escape** (SecretVerse Studio): chạy trên bàn phím kẹo/chocolate khổng lồ, **mỗi bước chân = +Speed**, vượt 13 stage, nhận Wins, nâng cấp và Rebirth.
Viết bằng JavaScript thuần + Three.js (đã kèm sẵn trong `vendor/`, **không cần cài gì, chạy offline được**).

## Cách chạy

- Mở thẳng `speed-keyboard-escape/index.html` bằng trình duyệt (Chrome/Edge/Firefox/Safari), **hoặc**
- Chạy server tĩnh ở thư mục gốc repo: `python3 -m http.server 8000` rồi vào `http://localhost:8000/speed-keyboard-escape/`.

Tiến trình tự lưu vào `localStorage` (Cài đặt → "Xoá tiến trình" để chơi lại từ đầu).

## Điều khiển

| Phím | Tác dụng |
|---|---|
| `W A S D` / mũi tên | Di chuyển (theo hướng camera) |
| `Space` | Nhảy |
| Kéo chuột (trái hoặc phải) | Xoay camera |
| Lăn chuột / `I` `O` | Zoom vào / ra |
| `Tab` | Bảng xếp hạng |
| `B` `R` `T` | Shop · Rebirth · Stages (teleport checkpoint) |
| `Esc` | Cài đặt / đóng bảng |

Mobile: joystick bên trái, nút **JUMP** bên phải, kéo ở vùng trống để xoay camera.

## Cơ chế đã mô phỏng

Nguồn nghiên cứu: wiki cộng đồng, các bài hướng dẫn (Sportskeeda, GameRant, TechWiser, ProGameGuides…) và trang game trên CrazyGames/Playgama.

**Lấy từ game gốc**

- Thế giới bàn phím khổng lồ làm từ kẹo/chocolate; mỗi bước chân cộng Speed kèm tiếng click ASMR; có gói âm thanh bước chân **Keyboard / Chocolate / Water / Bubbles / Lava** (chọn trong Cài đặt).
- **13 stage**: Gummy Gateway → Candy Cane Walk → Chocolate Creek → Marshmallow Maze → Caramel Canyon → Lollipop Ledge → Fudge Falls → Sprinkle Sprint → Truffle Tunnel → **Brainrot Boulevard** → Waffle Warp → Sugar Rush → Cocoa Crown.
- Cuối mỗi stage có **bệ vàng WIN** (phím vàng) → nhận Wins **+1, +3, +10, +20, +60, +100, +150, +300, +500, +1.000, +2.500, +10.000, +25.000** rồi bị teleport về Spawn.
- **Treadmill** (đứng chạy tại chỗ để cày Speed): Chocolate ×1 (miễn phí), Golden ×3, Diamond ×9, Candy ×25, Admin ×100.
- **Step Power** (hàng phím số): 3 Wins → +2, 15 → +3, 100 → +25, 500 → +50, 2.500 → +100, 15.000 → +250, 50.000 → +500 mỗi bước.
- Công thức Speed mỗi bước = (Step Power) × Rebirth × Trail × Aura (× Treadmill khi đứng trên treadmill).
- **Rebirth** 20 mốc: Lv15 ×1.5, Lv25 ×2, Lv40 ×2.5 … Lv600 ≈ ×100B; reset Speed nhưng giữ Wins/Trail/Aura/Treadmill/Step Power.
- **Trail** (Green 500 Wins … Rainbow 100.000 Wins) và **Aura** (Glow 1M, Wind 5M, Water 10M, Fire 25M, Void 50M, Godlike 1B Wins).
- Speed càng cao thì chạy nhanh hơn, **nhảy xa hơn** nhưng khó kiểm soát (quán tính, phím hẹp, khúc cua).
- Chướng ngại: khe nhảy dài dần theo stage, **cầu biến mất** sau vài giây, sàn di động, thanh quay, **brainrot** tuần tra/đuổi theo (nhảy qua đầu được), **laser** quét/khoá mục tiêu — phải **nấp sau khối lớn** để cắt tầm nhìn; rơi xuống biển chocolate → về checkpoint.
- Checkpoint (đầu stage + giữa stage), phím `I/O` zoom, `Tab` bảng xếp hạng, level theo mốc Speed.

**Ước lượng / khác game gốc** (không tìm được số liệu chính xác)

- Hệ số Trail/Aura, giá Treadmill (game gốc bán bằng Robux → ở đây mua bằng Wins), bảng Level↔Speed, bố cục từng stage, đường cong tốc độ chạy theo Speed.
- Không có multiplayer thật; bảng xếp hạng chứa **bot mô phỏng**. Không có quest/medal/code/pet.
- Âm thanh được tổng hợp bằng WebAudio (không dùng file âm thanh của game gốc); không dùng tài sản (asset) gốc của Roblox.

## Cấu trúc mã

```
index.html / style.css   khung trang + HUD kiểu Roblox (Fredoka)
vendor/three.min.js      Three.js r159 (MIT)
js/util.js               tiện ích, định dạng số (K, M, B, T…), lưu trữ
js/data.js               stage, upgrade, treadmill, trail/aura, rebirth, công thức Speed
js/audio.js              âm thanh tổng hợp (click ASMR + SFX)
js/entities.js           sàn di động, cầu biến mất, thanh quay, brainrot, laser
js/world.js              dựng bàn phím/stage từ "chương trình" chunk, lưới va chạm
js/fx.js                 hạt (trail, aura, confetti)
js/player.js             avatar, vật lý AABB, camera, input
js/ui.js                 HUD + bảng Shop/Rebirth/Stages/Cài đặt/Xếp hạng
js/main.js               vòng lặp, kinh tế, trigger, hiệu ứng
```

## Kiểm thử đã chạy

Mỗi stage được dựng từ danh sách chunk sinh theo seed cố định; chiều dài khe nhảy được tính từ Speed khuyến nghị (`D.moveSpeed`, thời gian bay 0,686 s). Một autopilot chạy mô phỏng (không cần render, `game.update(dt)`) đã **hoàn thành cả 13 stage** ở 0,6× / 0,8× / 1,0× Speed khuyến nghị (đã tắt sát thương để kiểm tra riêng hình học). Các chướng ngại gây sát thương được kiểm riêng: laser bắn khi lộ diện và không bắn khi nấp sau khối, thanh quay/brainrot/cầu biến mất/rơi biển đều hoạt động.
