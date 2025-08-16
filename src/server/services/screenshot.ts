import * as fs from "node:fs/promises";
import * as path from "node:path";
import puppeteer, { type Browser } from "puppeteer";
import { logger } from "./logger";

import { writeFile } from "node:fs/promises";

let browser: Browser | null = null;
const PUBLIC_DIR = path.join(process.cwd(), "public");

const buildInnerHtml = (html: string, css: string): string => {
    return `
      <head>
        <meta charset='utf-8'>
        <meta http-equiv='Content-Security-Policy'
              content="
                default-src 'none';
                style-src 'unsafe-inline';
                img-src 'none';
                font-src 'none';
                media-src 'none';
                connect-src 'none';
                object-src 'none';
                frame-src 'none';
                base-uri 'none';
                form-action 'none';
              ">
        <meta name='referrer' content='no-referrer'>
        <style>
        body {
          display: grid;
          place-items: center;
          height: 100vh;
          margin: 0;
          font-family: sans-serif;
        }
        </style>
        <style>${css}</style>
      </head>
      <body>
        ${html}
      </body>`;
};

export const initScreenshotService = async (): Promise<void> => {
  try {
    // publicディレクトリ全体の存在を確認
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    logger.info("Puppeteer browser instance initialized.");
  } catch (err) {
    logger.error("Failed to initialize Puppeteer:", err);
    process.exit(1);
  }
};

/**
 * HTMLとCSSからスクリーンショットを生成し、指定されたフルパスに保存する
 * @param html HTML文字列
 * @param css CSS文字列
 * @param fullOutputPath 保存先の完全なファイルパス (例: /path/to/project/prompts/prompt-1/target.png)
 * @returns ブラウザからアクセス可能なURLパス (例: /prompts/prompt-1/target.png)
 */
export const generateScreenshot = async (
  html: string,
  css: string,
  fullOutputPath: `${string}.png`,
): Promise<string> => {
  if (!browser) {
    await initScreenshotService();
    if (!browser) {
      throw new Error("Failed to initialize Puppeteer browser instance.");
    }
  }
  // 保存先ディレクトリの存在を確認・作成
  await fs.mkdir(path.dirname(fullOutputPath), { recursive: true });

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 600 });

    const inner = buildInnerHtml(html, css);
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(inner);

    // 引用符衝突を避けるため、srcdoc ではなく data:URL を使う
    const fullHtml = `
      <!doctype html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0">
        <iframe
          id="css-preview"
          sandbox
          referrerpolicy="no-referrer"
          style="border:0;width:800px;height:600px;display:block;margin:0 auto"
          src="${dataUrl}">
        </iframe>
      </body>
      </html>`;

    const outPath = fullOutputPath.replace(".png", ".html");

    await writeFile(outPath, fullHtml, { encoding: "utf8" }); // 上書き保存
    logger.info("saved:", outPath);

    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    await page.screenshot({ path: fullOutputPath, type: "png" });

    // process.cwd() を基準とした相対パスからURLを生成
    const urlPath = fullOutputPath
      .replace(process.cwd(), "")
      .replace(/\\/g, "/");
    logger.info(`Screenshot saved to: ${urlPath}`);
    return urlPath.startsWith("/public")
      ? urlPath.substring("/public".length)
      : urlPath;
  } finally {
    await page.close();
  }
};
