import { Hono } from "hono";

import { authSessionRateLimit, deleteSessionCookie, sessionMiddleware } from "@/server/middlewares/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";

import account from "./account/index.ts";
import linkedAccounts from "./linkedAccounts/index.ts";

/** What a signed-in user does with their session and account: who they are, signing out, their email and password. */
export default new Hono()
  .use(authSessionRateLimit)
  .use(sessionMiddleware)
  .route("/", account)
  .route("/", linkedAccounts)
  .get("/me", async (c) => {
    return c.json(await AuthenticationService.getCurrentUser(c.var.requestSession), 200);
  })
  .post("/sign-out", async (c) => {
    await AuthenticationService.signOut(c.var.requestSession);
    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  });
