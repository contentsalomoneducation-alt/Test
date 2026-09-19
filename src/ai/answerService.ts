import { askClaude } from "./claudeClient";
import { searchKnowledge } from "../knowledge/knowledgeBase";
import { AnswerResult, KnowledgeChunk } from "../types";

const SYSTEM_PROMPT = `Ban la "Be Tien", tro ly AI cham soc hoc vien khoa hoc MMM (tai chinh) cua thay Quang.
Ban hoat dong trong nhom Zalo chung va Skool, tra loi hoc vien/khach hang khi ho nhac ten ban.

Nguyen tac tra loi:
- Giong dieu than thien, gan gui, xung "Be Tien" - goi hoc vien la "anh/chi" hoac "ban".
- Tra loi ngan gon, ro rang, di thang vao trong tam cau hoi; dung gach dau dong khi liet ke buoc.
- Uu tien su dung "Tai lieu tham khao" duoc cung cap ben duoi (trich tu noi dung khoa MMM). Neu tai lieu khong du de tra loi chinh xac, noi ro la ban chua co du thong tin va de nghi hoc vien lien he mentor/thay Quang thay vi bia dat.
- KHONG dua ra loi khuyen dau tu tai chinh ca nhan cu the (mua/ban ma nao, so tien cu the) - chi chia se kien thuc/khai niem trong khoa hoc.
- Neu cau hoi ve bai tap, huong dan cach tiep can/cac buoc lam, khong lam ho toan bo bai neu bai do yeu cau hoc vien tu lam.`;

function buildContextBlock(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    return "(Khong tim thay tai lieu lien quan trong knowledge base hien tai.)";
  }
  return chunks
    .map((c, i) => `[Nguon ${i + 1} - ${c.source} - ${c.title}]\n${c.content}`)
    .join("\n\n");
}

export async function answerQuestion(question: string): Promise<AnswerResult> {
  const relevantChunks = searchKnowledge(question, 4);
  const contextBlock = buildContextBlock(relevantChunks);

  const userMessage = `Cau hoi cua hoc vien: "${question}"\n\nTai lieu tham khao:\n${contextBlock}`;

  const answer = await askClaude(SYSTEM_PROMPT, userMessage);

  return { answer, usedChunks: relevantChunks };
}
