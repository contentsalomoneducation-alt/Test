import { createServer } from "./server";
import { config } from "./config";

const app = createServer();

app.listen(config.port, () => {
  console.log(`Be Tien AI assistant dang chay tai http://localhost:${config.port}`);
  console.log(`Webhook Zalo OA: http://localhost:${config.port}/webhook/zalo`);
});
