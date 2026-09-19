# Be Tien - Tro ly AI cham soc hoc vien khoa MMM

Tro ly AI cham soc hoc vien tren moi truong online (nhom Zalo chung, Skool) cho khoa hoc tai chinh MMM cua thay Quang. Tro ly duoc goi la **"Be Tien"** - khi hoc vien/khach hang nhac den ten nay trong nhom Zalo, tro ly se tra loi cau hoi ve noi dung khoa hoc, kien thuc tai chinh, va huong dan lam bai tap.

## Kien truc tong quan

```
Zalo OA group chat
   |  (webhook: user_send_text)
   v
Express server  ---->  mentionDetector (co nhac "Be Tien" khong?)
   |                          |
   |                          v khong -> im lang
   |                        co
   |                          v
   |                   knowledgeBase (tim doan tai lieu MMM lien quan)
   |                          |
   |                          v
   |                   Claude API (sinh cau tra loi dua tren tai lieu)
   |                          |
   v                          v
Zalo Send API  <----  answerService
```

- **Kich hoat co chon loc**: tro ly chi tra loi khi duoc nhac ten truc tiep (`Be Tien`, cau hinh trong `ASSISTANT_TRIGGER_NAMES`), tranh spam tra loi moi tin nhan trong nhom.
- **Retrieval don gian tu markdown**: kien thuc khoa MMM luu duoi dang file `.md` trong `data/knowledge/`, duoc cat thanh chunk theo heading va tim theo tu khoa truoc khi dua vao prompt cho Claude. De nang cap len vector search/embedding khi noi dung lon hon.
- **Tra loi co kiem soat**: system prompt yeu cau tro ly uu tien tai lieu duoc cung cap, khong bia dat, khong tu van tai chinh ca nhan cu the, va khong lam ho toan bo bai tap.

## Cau truc thu muc

```
src/
  config.ts              # doc bien moi truong
  types.ts
  server.ts               # Express app + route
  index.ts                 # entrypoint
  trigger/mentionDetector.ts   # phat hien "Be Tien" duoc nhac den
  knowledge/knowledgeBase.ts   # load + tim kiem tai lieu markdown
  ai/claudeClient.ts           # goi Claude API
  ai/answerService.ts          # ghep retrieval + goi Claude
  zalo/zaloClient.ts            # gui tin nhan qua Zalo OA Send API
  zalo/verifySignature.ts       # xac thuc webhook Zalo
  webhook/zaloWebhook.ts        # xu ly su kien webhook Zalo OA
  cli/chatTester.ts             # test logic tra loi qua terminal, khong can Zalo
data/knowledge/*.md        # noi dung khoa MMM (hien la du lieu mau - can thay the)
```

## Cai dat

```bash
npm install
cp .env.example .env
```

Dien vao `.env`:
- `ANTHROPIC_API_KEY`: API key Claude (bat buoc de tro ly tra loi)
- `ZALO_OA_*`: thong tin Zalo Official Account (app id/secret, access token, webhook secret) - lay tu https://developers.zalo.me sau khi tao App va lien ket OA
- `ASSISTANT_TRIGGER_NAMES`: danh sach ten/alias de kich hoat tro ly (mac dinh gom "Bé Tiền")

## Chay thu khong can Zalo (khuyen nghi khi phat trien)

```bash
npm run chat
```

Mo mot "hoi thoai" gia lap trong terminal - go tin nhan co nhac "Be Tien" de xem tro ly tra loi dua tren knowledge base hien co.

## Chay server that (tich hop Zalo OA)

```bash
npm run dev
```

1. Dung ngrok (hoac tunnel tuong tu) de expose `http://localhost:3000/webhook/zalo` ra internet.
2. Vao trang quan tri Zalo OA (oa.zalo.me) > muc Webhook > khai bao URL webhook va secret key (dien vao `ZALO_OA_WEBHOOK_SECRET`).
3. Dam bao OA da bat quyen nhan/gui tin nhan trong nhom (group chat) neu can cham soc o nhom Zalo chung.
4. Kiem tra `verifySignature.ts` - doi chieu lai voi tai lieu Zalo OA webhook hien hanh truoc khi dua len production, vi co che ky co the thay doi theo phien ban API.

## Cap nhat knowledge base

Them/sua file `.md` trong `data/knowledge/`. Moi heading `## ...` trong file se duoc coi la mot chunk rieng khi tim kiem - nen chia noi dung thanh cac muc nho, ro rang (vi du: mot cau hoi FAQ = mot heading).

Noi dung hien tai trong `data/knowledge/` la **du lieu mau (placeholder)** - can thay bang tai lieu/bai giang/FAQ that cua khoa MMM truoc khi dua tro ly vao su dung thuc te.

## Tich hop voi Skool

Skool hien chua co webhook/API cong khai chinh thuc cho chatbot theo thoi diem thiet ke du an nay. Huong tiep can de xuat:
- Truoc mat: dua noi dung tu Skool (bai giang, FAQ, thong bao) vao `data/knowledge/` thu cong hoac qua script dong bo rieng.
- Ve sau: neu Skool mo API/webhook chinh thuc, them mot module `src/skool/` tuong tu `src/zalo/` de tich hop truc tiep.

## Cac buoc tiep theo (roadmap)

- [ ] Thay noi dung mau trong `data/knowledge/` bang tai lieu that cua khoa MMM
- [ ] Dien cac bien `ZALO_OA_*` va test webhook that voi OA cua thay Quang
- [ ] Xac nhan lai co che ky webhook voi tai lieu Zalo OA moi nhat
- [ ] Can nhac nang cap retrieval len embedding/vector search khi so luong tai lieu lon
- [ ] Bo sung logging/monitoring va rate limiting cho webhook truoc khi dua vao production
- [ ] Xay dung co che dong bo noi dung tu Skool (khi co API/webhook chinh thuc)
