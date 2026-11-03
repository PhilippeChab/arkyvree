import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { OAuthService } from "@/server/services/authentication/oauth/index.ts";

/**
 * What the signed-in user answers of the apps that sign in to the MCP server: an app's sign-in, on the consent page
 * (allowed, reading alone or not, or turned down), and the apps they connected, which Settings lists and disconnects. A
 * demo account has none of these.
 */
export default new Hono<SessionContext>()
  .get("/connected-apps", denyDemoUser, async (c) =>
    c.json(await OAuthService.getConnectedApps(c.var.requestSession), 200),
  )
  .get("/oauth/authorizations/:id", denyDemoUser, validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await OAuthService.getAuthorization(c.var.requestSession, id), 200);
  })
  .post(
    "/oauth/authorizations/:id/approve",
    denyDemoUser,
    validate("param", idParam),
    // Whether the app reads alone: the MCP server offers it the tools that read, and refuses it a change
    validate("json", z.object({ readOnly: z.boolean() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { readOnly } = c.req.valid("json");
      return c.json(await OAuthService.acceptAuthorization(c.var.requestSession, id, readOnly), 200);
    },
  )
  .post("/oauth/authorizations/:id/deny", denyDemoUser, validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await OAuthService.rejectAuthorization(c.var.requestSession, id), 200);
  })
  .delete("/connected-apps/:id", denyDemoUser, validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await OAuthService.deleteConnectedApp(c.var.requestSession, id), 200);
  });
