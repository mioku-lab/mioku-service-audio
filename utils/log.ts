import { logger } from "mioku";

export const audioLog = {
  info(message: string): void {
    logger.info(`[audio] ${message}`);
  },
  warn(message: string): void {
    logger.warn(`[audio] ${message}`);
  },
  error(message: string): void {
    logger.error(`[audio] ${message}`);
  },
  debug(message: string): void {
    logger.debug(`[audio] ${message}`);
  },
};

export function tag(prefix: string, message: string): string {
  return `[${prefix}] ${message}`;
}
