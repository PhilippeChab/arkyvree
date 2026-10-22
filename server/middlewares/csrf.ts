import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";

import { isTest } from "@/server/environment.ts";

/**
 * Refuses a write a browser sends from another site (`origin` the app's), which its session cookie would sign: every
 * route but the public API's (`/v1`), which signs in with a key a browser never sends on its own, and whose callers
 * send a write without a body (a DELETE) or a form (an upload) with no `Origin`. Off in the tests.
 */
export function checkCsrf(origin: string | string[], enabled = !isTest()) {
  const check = csrf({ origin });
  return createMiddleware(async (c, next) => {
    if (!enabled || c.req.path === "/v1" || c.req.path.startsWith("/v1/")) return await next();
    return await check(c, next);
  });
}
