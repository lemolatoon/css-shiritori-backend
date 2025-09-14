import * as path from "node:path";
import { startServer } from "./server";
import { shotPrompt } from "./server/services/prompts";

(async () => {
  if (process.argv.length > 2) {
    const arg = process.argv[2];
    await shotPrompt(path.join(process.cwd(), "sample"), arg).catch((err) => {
      console.error("Error generating screenshot:", err);
    });
  } else {
    startServer();
  }
})();
