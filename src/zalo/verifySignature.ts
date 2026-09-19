import crypto from "crypto";
import { config } from "../config";

/**
 * Xac thuc webhook den tu Zalo OA.
 *
 * QUAN TRONG: Zalo cap nhat co che ky (mac/signature) theo tung phien ban API.
 * Truoc khi deploy that, doi chieu lai voi tai lieu Webhook hien hanh tai
 * https://developers.zalo.me/docs/api/official-account-api/webhook
 * va chinh sua ham nay cho khop (ten header, thu tu ghep chuoi truoc khi hash...).
 *
 * Mac dinh o day: HMAC-SHA256(appId + rawBody + webhookSecret), so sanh voi
 * header "x-zevent-signature". Neu chua cau hinh webhookSecret (dev/test),
 * bo qua buoc xac thuc.
 */
export function verifyZaloSignature(rawBody: string, signatureHeader?: string): boolean {
  if (!config.zalo.webhookSecret) {
    console.warn("[verifySignature] ZALO_OA_WEBHOOK_SECRET chua duoc cau hinh, bo qua xac thuc (chi dung cho dev).");
    return true;
  }

  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", config.zalo.webhookSecret)
    .update(config.zalo.appId + rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
