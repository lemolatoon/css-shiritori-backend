import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Prompt } from "../../common/events";
import { logger } from "./logger";
import { generateScreenshot } from "./screenshot"; // 追記

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const initialPrompts: Prompt[] = [];

export const loadInitialPrompts = async (): Promise<void> => {
  try {
    const promptFolders = await fs.readdir(PROMPTS_DIR, {
      withFileTypes: true,
    });
    for (const folder of promptFolders) {
      if (folder.isDirectory()) {
        const promptPath = path.join(PROMPTS_DIR, folder.name);
        const htmlPath = path.join(promptPath, "index.html");
        const cssPath = path.join(promptPath, "style.css"); // 変更
        const imagePath = path.join(
          promptPath,
          "target.png",
        ) as `${string}.png`;

        const [htmlBuffer, cssBuffer] = await Promise.all([
          fs.readFile(htmlPath).catch(() => null),
          fs.readFile(cssPath).catch(() => null),
        ]);

        if (htmlBuffer && cssBuffer) {
          const html = htmlBuffer.toString("utf-8");
          const css = cssBuffer.toString("utf-8");

          // スクリーンショットを生成して保存
          const targetImageUrl = await generateScreenshot(html, css, imagePath);

          initialPrompts.push({ html, targetImageUrl });
          logger.info(`Generated prompt target for ${folder.name}`);
        }
      }
    }
    logger.info(
      `Successfully loaded and generated ${initialPrompts.length} initial prompts.`,
    );
  } catch (err) {
    logger.error("Failed to load initial prompts:", err);
    process.exit(1);
  }
};

export const getRandomPrompts = (count: number): Prompt[] => {
  const shuffled = [...initialPrompts].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};
