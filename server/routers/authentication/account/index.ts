import { Hono } from "hono";
import { z } from "zod";

import { deleteSessionCookie, denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { sanitizedEmail, sanitizedText } from "@/server/routers/api/validation.ts";
import { checkPasswordConfirmation, sanitizedPassword } from "@/server/routers/authentication/validation.ts";
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
  .post(
    "/delete-account",
    denyDemoUser,
    validate("json", z.object({ password: sanitizedText.min(1).optional() })),
    async (c) => {
      const { password } = c.req.valid("json");
      await AccountService.deleteAccount(c.var.requestSession, password);
      deleteSessionCookie(c);
      return c.json({ success: true }, 200);
    },
  )
  .post("/resend-email-change", denyDemoUser, async (c) => {
    await AccountService.resendEmailChange(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post(
    "/set-password",
    denyDemoUser,
    validate(
      "json",
      z
        .object({ newPassword: sanitizedPassword, newPasswordConfirmation: sanitizedPassword })
        .check(checkPasswordConfirmation("newPassword")),
    ),
    async (c) => {
      const { newPassword } = c.req.valid("json");
      return c.json(await AccountService.setPassword(c.var.requestSession, newPassword), 200);
    },
  )
  .post("/verify-email-change", denyDemoUser, validate("json", z.object({ code: sanitizedText })), async (c) => {
    const { code } = c.req.valid("json");
    return c.json(await AccountService.verifyEmailChange(c.var.requestSession, code), 200);
  })
  .put(
    "/password",
    denyDemoUser,
    validate(
      "json",
      z
        .object({
          currentPassword: sanitizedText.min(1),
          newPassword: sanitizedPassword,
          newPasswordConfirmation: sanitizedPassword,
        })
        .check(checkPasswordConfirmation("newPassword")),
    ),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid("json");
      return c.json(await AccountService.updatePassword(c.var.requestSession, currentPassword, newPassword), 200);
    },
  )
  .put(
    "/profile",
    denyDemoUser,
    validate(
      "json",
      z.object({ username: sanitizedText.min(3).max(50).optional(), emailAddress: sanitizedEmail.optional() }),
    ),
    async (c) => {
      const { username, emailAddress } = c.req.valid("json");
      return c.json(await AccountService.updateProfile(c.var.requestSession, username, emailAddress), 200);
    },
  );
