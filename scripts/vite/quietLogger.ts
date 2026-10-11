import { createLogger } from "vite";

/**
 * Vite's logger, without the noisy /ws-proxy disconnect lines vite emits when a playwright tab tears down: "ws proxy
 * error: ... ECONNRESET" and "ws proxy socket error: ... ECONNRESET". They are expected on abrupt client disconnect, not
 * actionable, and clutter the test log. Anything else still surfaces normally.
 * https://github.com/vitejs/vite/issues/2974, https://github.com/vitejs/vite/issues/4794
 */
export function createQuietLogger() {
  const logger = createLogger();
  const logError = logger.error.bind(logger);
  logger.error = (msg, options) => {
    if (/ws proxy (?:error|socket error)|ECONNRESET|EPIPE/.test(msg)) return;
    logError(msg, options);
  };
  return logger;
}
