import { Hono } from "hono";

import { deleteSessionCookie, denyDemoUser, type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import {
  DeleteAccountJson,
  SetPasswordJson,
  UpdatePasswordJson,
  UpdateProfileJson,
  VerifyEmailChangeJson,
} from "@/server/routers/authentication/validation.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";

export default new Hono<SessionContext>()
  .post("/cancel-email-change", denyDemoUser, async (c) => {
    await AccountService.cancelEmailChange(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/complete-onboarding", async (c) => {
    await AccountService.completeOnboarding(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/delete-account", denyDemoUser, zValidator("json", DeleteAccountJson), async (c) => {
    const body = c.req.valid("json");
    await AccountService.deleteAccount(c.var.requestSession, body.password);
    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  })
  .post("/resend-email-change", denyDemoUser, async (c) => {
    await AccountService.resendEmailChange(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/set-password", denyDemoUser, zValidator("json", SetPasswordJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AccountService.setPassword(c.var.requestSession, body.newPassword), 200);
  })
  .post("/verify-email-change", denyDemoUser, zValidator("json", VerifyEmailChangeJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AccountService.verifyEmailChange(c.var.requestSession, body.code), 200);
  })
  .put("/password", denyDemoUser, zValidator("json", UpdatePasswordJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(
      await AccountService.updatePassword(c.var.requestSession, body.currentPassword, body.newPassword),
      200,
    );
  })
  .put("/profile", denyDemoUser, zValidator("json", UpdateProfileJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AccountService.updateProfile(c.var.requestSession, body.username, body.emailAddress), 200);
  });
