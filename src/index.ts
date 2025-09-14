import { startServer } from "./server";
import { shotPrompt } from "./server/services/prompts";

(async () => {
  if (process.argv.length > 2) {
    const arg = process.argv[2];
    await shotPrompt(arg);
  } else {
    startServer();
  }
})();
