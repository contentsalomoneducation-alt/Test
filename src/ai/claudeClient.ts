import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropic.apiKey) {
      throw new Error("Thieu ANTHROPIC_API_KEY trong file .env");
    }
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

export async function askClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}
