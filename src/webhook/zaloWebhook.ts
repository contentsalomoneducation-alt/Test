import { Request, Response } from "express";
import { verifyZaloSignature } from "../zalo/verifySignature";
import { sendZaloMessage } from "../zalo/zaloClient";
import { isAssistantMentioned, stripTriggerName } from "../trigger/mentionDetector";
import { answerQuestion } from "../ai/answerService";
import { IncomingMessage } from "../types";

interface ZaloWebhookEvent {
  app_id: string;
  event_name: string;
  sender?: { id: string };
  user_id_by_app?: string;
  message?: { text?: string; msg_id?: string };
  timestamp?: string;
}

function parseZaloEvent(body: ZaloWebhookEvent): IncomingMessage | null {
  if (body.event_name !== "user_send_text" || !body.message?.text || !body.sender?.id) {
    return null;
  }
  return {
    senderId: body.sender.id,
    text: body.message.text,
    conversationId: body.sender.id,
    timestamp: body.timestamp ? Number(body.timestamp) : Date.now(),
  };
}

export async function handleZaloWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.header("x-zevent-signature") ?? undefined;
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (!verifyZaloSignature(rawBody, signature)) {
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  // Tra loi 200 ngay de Zalo khong retry, xu ly tra loi bat dong bo ben duoi.
  res.status(200).json({ ok: true });

  const incoming = parseZaloEvent(req.body);
  if (!incoming) return;

  if (!isAssistantMentioned(incoming.text)) {
    return;
  }

  const question = stripTriggerName(incoming.text);
  if (!question) return;

  try {
    const { answer } = await answerQuestion(question);
    await sendZaloMessage(incoming.senderId, answer || "Xin loi anh/chi, Be Tien chua co cau tra loi phu hop cho cau hoi nay ạ.");
  } catch (err) {
    console.error("[zaloWebhook] Loi khi xu ly cau hoi:", err);
    await sendZaloMessage(
      incoming.senderId,
      "Be Tien dang gap chut truc trac ky thuat, anh/chi vui long thu lai sau it phut nha!"
    ).catch(() => undefined);
  }
}
