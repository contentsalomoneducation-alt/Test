import fs from "fs";
import path from "path";
import { KnowledgeChunk } from "../types";

const KNOWLEDGE_DIR = path.join(__dirname, "..", "..", "data", "knowledge");

let cachedChunks: KnowledgeChunk[] | null = null;

/**
 * Cat moi file markdown thanh cac chunk theo tung heading "## ",
 * de viec tim kiem/tra cuu chinh xac hon la nhet ca file vao prompt.
 */
function splitIntoChunks(source: string, rawText: string): KnowledgeChunk[] {
  const sections = rawText.split(/\n(?=## )/g);
  return sections
    .map((section, index) => section.trim())
    .filter(Boolean)
    .map((section, index) => {
      const titleMatch = section.match(/^#{1,2}\s*(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : `${source} #${index + 1}`;
      return {
        id: `${source}#${index}`,
        title,
        source,
        content: section,
      };
    });
}

export function loadKnowledgeBase(forceReload = false): KnowledgeChunk[] {
  if (cachedChunks && !forceReload) return cachedChunks;

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    cachedChunks = [];
    return cachedChunks;
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".md"));
  const chunks: KnowledgeChunk[] = [];

  for (const file of files) {
    const fullPath = path.join(KNOWLEDGE_DIR, file);
    const rawText = fs.readFileSync(fullPath, "utf-8");
    chunks.push(...splitIntoChunks(file, rawText));
  }

  cachedChunks = chunks;
  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * Tim kiem tu khoa don gian (keyword overlap scoring). Du an ban dau uu tien
 * don gian, de nang cap sang embedding/vector search khi knowledge base lon hon.
 */
export function searchKnowledge(query: string, topK = 4): KnowledgeChunk[] {
  const chunks = loadKnowledgeBase();
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || chunks.length === 0) return [];

  const scored = chunks.map((chunk) => {
    const chunkTokens = tokenize(`${chunk.title} ${chunk.content}`);
    let score = 0;
    for (const token of chunkTokens) {
      if (queryTokens.has(token)) score += 1;
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}
