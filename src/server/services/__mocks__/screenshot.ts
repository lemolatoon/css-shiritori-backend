// services/screenshot.ts のモック実装
export const initScreenshotService = jest.fn().mockResolvedValue(undefined);
export const generateScreenshot = jest
  .fn()
  .mockImplementation(
    async (
      _html: string,
      _css: string,
      fullOutputPath: string,
    ): Promise<string> => {
      const urlPath = fullOutputPath
        .replace(process.cwd(), "")
        .replace(/\\/g, "/");
      return Promise.resolve(
        urlPath.startsWith("/public")
          ? urlPath.substring("/public".length)
          : urlPath,
      );
    },
  );
