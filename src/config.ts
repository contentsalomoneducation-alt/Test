import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),

  anthropic: {
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    model: requireEnv("ANTHROPIC_MODEL", "claude-sonnet-5"),
  },

  zalo: {
    oaId: requireEnv("ZALO_OA_ID"),
    appId: requireEnv("ZALO_OA_APP_ID"),
    appSecret: requireEnv("ZALO_OA_APP_SECRET"),
    accessToken: requireEnv("ZALO_OA_ACCESS_TOKEN"),
    refreshToken: requireEnv("ZALO_OA_REFRESH_TOKEN"),
    webhookSecret: requireEnv("ZALO_OA_WEBHOOK_SECRET"),
  },

  triggerNames: requireEnv("ASSISTANT_TRIGGER_NAMES", "Bé Tiền,be tien")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
