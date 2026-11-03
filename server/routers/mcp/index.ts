import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { isProduction, readEnv } from "@/server/environment.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { type ApiKeyContext, mcpAddressRateLimit, mcpSignIn } from "@/server/middlewares/index.ts";

import { buildMcpServer } from "./buildMcpServer.ts";

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

/**
 * The MCP server (`/mcp`): the app's tools for an agent (Claude, ChatGPT, Claude Code…), over the public API's routes,
 * signed in as its user by an OAuth token (an app its user connected) or an API key (`mcpSignIn`). Stateless: each
 * request is answered by a server made for it (`buildMcpServer`), so any of the app's machines answers any request.
 * An address's failed requests are counted (an app's servers send every user's from a few), and the user's requests
 * per route its tools call, as `/v1` counts a key's.
 */
export default new Hono<ApiKeyContext>()
  .use(refuseOtherOrigins)
  .use(mcpAddressRateLimit)
  .use(mcpSignIn)
  .all("/", async (c) => {
    const caller = { readOnly: c.var.readOnly, session: c.var.requestSession };
    const handler = createMcpHandler(() => buildMcpServer(caller));
    return await handler.fetch(c.req.raw);
  });
