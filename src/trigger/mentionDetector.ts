import { config } from "../config";

function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim();
}

/**
 * Trong nhom Zalo/Skool, tro ly chi nen tra loi khi duoc goi ten truc tiep
 * (vd "Bé Tiền ơi...", "hỏi Bé Tiền..."), tranh spam tra loi moi tin nhan trong nhom.
 */
export function isAssistantMentioned(text: string): boolean {
  const normalized = normalize(text);
  return config.triggerNames.some((name) => normalized.includes(normalize(name)));
}

/**
 * Bo phan goi ten tro ly khoi cau hoi de lay noi dung thuc su can tra loi.
 */
export function stripTriggerName(text: string): string {
  let result = text;
  for (const name of config.triggerNames) {
    const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}
