import express, { Express, Request } from "express";
import { handleZaloWebhook } from "./webhook/zaloWebhook";

export function createServer(): Express {
  const app = express();

  app.use(
    express.json({
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString("utf-8");
      },
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "be-tien-ai-assistant" });
  });

  // Zalo OA se goi ca GET (verify domain) va POST (event) vao cung endpoint webhook.
  app.get("/webhook/zalo", (_req, res) => res.status(200).send("OK"));
  app.post("/webhook/zalo", handleZaloWebhook);

  return app;
}
