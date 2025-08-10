const info = (message: string, ...args: unknown[]) => {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
};

const error = (message: string, ...args: unknown[]) => {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
};

export const logger = { info, error };