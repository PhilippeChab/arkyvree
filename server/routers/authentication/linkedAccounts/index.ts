import { Hono } from "hono";

import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { GoogleSignInJson, UnlinkOauthJson } from "@/server/routers/authentication/validation.ts";
import { LinkedAccountsService } from "@/server/services/authentication/linkedAccounts/index.ts";

export default new Hono<SessionContext>()
  .get("/linked-accounts", async (c) => {
    return c.json(await LinkedAccountsService.getLinkedAccounts(c.var.requestSession), 200);
  })
  .post("/link-google", denyDemoUser, validate("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await LinkedAccountsService.linkGoogleAccount(c.var.requestSession, body.idToken), 200);
  })
  .post("/unlink-oauth", denyDemoUser, validate("json", UnlinkOauthJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await LinkedAccountsService.unlinkOauthAccount(c.var.requestSession, body.provider), 200);
  });
