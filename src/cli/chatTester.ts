import readline from "readline";
import { isAssistantMentioned, stripTriggerName } from "../trigger/mentionDetector";
import { answerQuestion } from "../ai/answerService";

/**
 * Cong cu test nhanh logic tra loi trong terminal, khong can Zalo OA that.
 * Chay: npm run chat
 */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('Mo phong nhom chat. Go tin nhan co nhac "Be Tien" de duoc tra loi. Ctrl+C de thoat.\n');

function prompt(): void {
  rl.question("Ban: ", async (line) => {
    if (!isAssistantMentioned(line)) {
      console.log("(Be Tien khong duoc nhac ten, im lang trong nhom)\n");
      prompt();
      return;
    }

    const question = stripTriggerName(line);
    try {
      const { answer, usedChunks } = await answerQuestion(question);
      console.log(`\nBe Tien: ${answer}`);
      if (usedChunks.length > 0) {
        console.log(`(nguon: ${usedChunks.map((c) => c.source).join(", ")})`);
      }
      console.log();
    } catch (err) {
      console.error("Loi:", err instanceof Error ? err.message : err);
    }
    prompt();
  });
}

prompt();
