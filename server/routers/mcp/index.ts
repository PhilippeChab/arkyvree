import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { isProduction, readEnv } from "@/server/environment.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { apiAddressRateLimit, type ApiKeyContext, apiKeyMiddleware } from "@/server/middlewares/index.ts";

import { buildMcpServer } from "./buildMcpServer.ts";

/** The headers that name a request's address, which a tool's calls send on: the routes that count per address read them. */
const ADDRESS_HEADERS = ["x-forwarded-for", "x-real-ip"];

/** The app's pages' origin, the one a browser may send: the dev server's outside production. */
const ownOrigin = isProduction() ? readEnv("APP_URL") && new URL(readEnv("APP_URL")!).origin : "http://localhost:5173";

/**
 * Refuses a request a browser page sends from another site (an `Origin` that isn't the app's), as MCP asks of a server
 * reached over HTTP: a page whose host name points at the app's address would otherwise reach it. A client outside a
 * browser sends none.
 */
const refuseOtherOrigins = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && origin !== ownOrigin) throw new ForbiddenError("The MCP server answers no page of another site");
  await next();
});

/** The address headers a request sends (`ADDRESS_HEADERS`), by their names. */
function readAddresses(header: (name: string) => string | undefined): Record<string, string> {
  return Object.fromEntries(
    ADDRESS_HEADERS.flatMap((name) => {
      const value = header(name);
      return value ? [[name, value]] : [];
    }),
  );
}

/**
 * The MCP server (`/mcp`): the app's tools for an agent (Claude, ChatGPT, Claude Code…), over the public API's routes,
 * signed in with an API key that acts as its user, as `/v1` is. Stateless: each request is answered by a server made
 * for it (`buildMcpServer`), so any of the app's machines answers any request. Its requests are counted as
 * `/v1`'s: an address's before its key is looked up, and the user's per route its tools call.
 */
export default new Hono<ApiKeyContext>()
  .use(refuseOtherOrigins)
  // Counted before the key's lookup, which a wrong key or none would cost uncounted
  .use(apiAddressRateLimit)
  .use(apiKeyMiddleware)
  .all("/", async (c) => {
    const caller = { addresses: readAddresses((name) => c.req.header(name)), session: c.var.requestSession };
    const handler = createMcpHandler(() => buildMcpServer(caller));
    return await handler.fetch(c.req.raw);
  });
