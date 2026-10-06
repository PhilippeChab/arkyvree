import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { sanitizedText } from "@/server/routers/api/validation.ts";
import { LinkedAccountsService } from "@/server/services/authentication/linkedAccounts/index.ts";

export default new Hono<SessionContext>()
  .get("/linked-accounts", async (c) => {
    return c.json(await LinkedAccountsService.getLinkedAccounts(c.var.requestSession), 200);
  })
  .post("/link-google", denyDemoUser, validate("json", z.object({ idToken: z.string().min(1) })), async (c) => {
    const { idToken } = c.req.valid("json");
    return c.json(await LinkedAccountsService.linkGoogleAccount(c.var.requestSession, idToken), 200);
  })
  .post("/unlink-oauth", denyDemoUser, validate("json", z.object({ provider: sanitizedText.min(1) })), async (c) => {
    const { provider } = c.req.valid("json");
    return c.json(await LinkedAccountsService.unlinkOauthAccount(c.var.requestSession, provider), 200);
  });
