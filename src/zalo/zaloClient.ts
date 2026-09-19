import { config } from "../config";

const ZALO_SEND_MESSAGE_URL = "https://openapi.zalo.me/v3.0/oa/message/cs";

/**
 * Gui tin nhan tra loi ve mot user/hoi thoai qua Zalo OA Send API.
 * Tai lieu: https://developers.zalo.me/docs/api/official-account-api/tin-nhan/gui-tin-nhan-cho-nguoi-dung
 */
export async function sendZaloMessage(userId: string, text: string): Promise<void> {
  if (!config.zalo.accessToken) {
    console.warn("[zaloClient] Thieu ZALO_OA_ACCESS_TOKEN, bo qua gui tin nhan (dev mode).");
    console.info(`[zaloClient] (would send to ${userId}): ${text}`);
    return;
  }

  const res = await fetch(ZALO_SEND_MESSAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.zalo.accessToken,
    },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zalo send message that bai (${res.status}): ${body}`);
  }
}
