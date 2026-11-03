import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";

import { isTest } from "@/server/environment.ts";

/**
 * The routes that read no cookie: the public API's and the MCP server's, which a key or a token a browser never sends
 * on its own signs in, and the OAuth endpoints an app's server posts its forms to (`/oauth/token`, `/oauth/revoke`).
 */
const KEYED_PREFIXES = ["/v1", "/mcp", "/oauth/token", "/oauth/revoke"];

/**
 * Refuses a write a browser sends from another site (`origin` the app's), which its session cookie would sign: every
 * route but those that read no cookie (`KEYED_PREFIXES`), whose callers send a write without a body (a DELETE) or a
 * form (an upload, a token's exchange) with no `Origin`. Off in the tests.
 */
export function checkCsrf(origin: string | string[], enabled = !isTest()) {
  const check = csrf({ origin });
  const isKeyed = (path: string) => KEYED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return createMiddleware(async (c, next) => {
    if (!enabled || isKeyed(c.req.path)) return await next();
    return await check(c, next);
  });
}
