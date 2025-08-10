import puppeteer, { Browser } from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

let browser: Browser | null = null;
const PUBLIC_DIR = path.join(process.cwd(), 'public');

export const initScreenshotService = async (): Promise<void> => {
  try {
    // publicディレクトリ全体の存在を確認
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    logger.info('Puppeteer browser instance initialized.');
  } catch (err) {
    logger.error('Failed to initialize Puppeteer:', err);
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
  fullOutputPath: `${string}.png`
): Promise<string> => {
  if (!browser) {
    await initScreenshotService();
    if (!browser) {
      throw new Error('Failed to initialize Puppeteer browser instance.');
    }
  }
  // 保存先ディレクトリの存在を確認・作成
  await fs.mkdir(path.dirname(fullOutputPath), { recursive: true });

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 600 });
    
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Screenshot</title>
          <style>${css}</style>
      </head>
      <body>
          ${html}
      </body>
      </html>
    `;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: fullOutputPath, type: 'png' });
    
    // process.cwd() を基準とした相対パスからURLを生成
    const urlPath = fullOutputPath.replace(process.cwd(), '').replace(/\\/g, '/');
    return urlPath.startsWith('/public') ? urlPath.substring('/public'.length) : urlPath;

  } finally {
    await page.close();
  }
};