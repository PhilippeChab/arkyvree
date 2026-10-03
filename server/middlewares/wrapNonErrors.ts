import { createMiddleware } from "hono/factory";

/**
 * A thrown value that isn't an `Error` (a dependency's string, a rethrown caught value) becomes one. Hono hands only
 * Errors to `onError`; anything else would escape it to the runtime's bare 500, without the API's envelope.
 */
export default createMiddleware(async (_, next) => {
  try {
    await next();
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
});
