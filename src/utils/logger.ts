const prefix = '[Molgian Bureau]';

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) {
      console.log(`${prefix} ${message}`, meta);
      return;
    }
    console.log(`${prefix} ${message}`);
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) {
      console.warn(`${prefix} ${message}`, meta);
      return;
    }
    console.warn(`${prefix} ${message}`);
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) {
      console.error(`${prefix} ${message}`, meta);
      return;
    }
    console.error(`${prefix} ${message}`);
  }
};
