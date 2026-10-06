import { Hono } from "hono";
import { z } from "zod";

import {
  authEmailRateLimit,
  authRateLimit,
  getSessionCookie,
  setSessionCookie,
  validate,
} from "@/server/middlewares/index.ts";
import { sanitizedEmail, sanitizedText } from "@/server/routers/api/validation.ts";
import { checkPasswordConfirmation, sanitizedPassword } from "@/server/routers/authentication/validation.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";

/** What a signed-out user does: sign up, verify their email, sign in, reset their password. */
export default new Hono()
  .post(
    "/forgot-password",
    authRateLimit,
    authEmailRateLimit,
    validate("json", z.object({ emailAddress: sanitizedEmail })),
    async (c) => {
      const { emailAddress } = c.req.valid("json");
      await AuthenticationService.forgotPassword(emailAddress);
      return c.json({ success: true }, 200);
    },
  )
  .post("/google", authRateLimit, validate("json", z.object({ idToken: z.string().min(1) })), async (c) => {
    const { idToken } = c.req.valid("json");
    const { session, user } = await AuthenticationService.signInWithGoogle(idToken, getSessionCookie(c));
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post(
    "/resend-verification",
    authRateLimit,
    authEmailRateLimit,
    validate("json", z.object({ emailAddress: sanitizedEmail })),
    async (c) => {
      const { emailAddress } = c.req.valid("json");
      await AuthenticationService.resendVerification(emailAddress);
      return c.json({ success: true }, 200);
    },
  )
  .post(
    "/reset-password",
    authRateLimit,
    validate(
      "json",
      z
        .object({
          emailAddress: sanitizedEmail,
          code: sanitizedText,
          newPassword: sanitizedPassword,
          newPasswordConfirmation: sanitizedPassword,
        })
        .check(checkPasswordConfirmation("newPassword")),
    ),
    async (c) => {
      const { emailAddress, code, newPassword } = c.req.valid("json");
      await AuthenticationService.resetPassword(emailAddress, code, newPassword);
      return c.json({ success: true }, 200);
    },
  )
  .post(
    "/sign-in",
    authRateLimit,
    validate("json", z.object({ emailAddress: sanitizedEmail, password: sanitizedText })),
    async (c) => {
      const { emailAddress, password } = c.req.valid("json");
      const { session, user } = await AuthenticationService.signIn(emailAddress, password, getSessionCookie(c));
      setSessionCookie(c, session.id);
      return c.json(user, 200);
    },
  )
  .post(
    "/sign-up",
    authRateLimit,
    authEmailRateLimit,
    validate(
      "json",
      z
        .object({ emailAddress: sanitizedEmail, password: sanitizedPassword, passwordConfirmation: sanitizedPassword })
        .check(checkPasswordConfirmation("password")),
    ),
    async (c) => {
      const { emailAddress, password } = c.req.valid("json");
      await AuthenticationService.signUp(emailAddress, password);
      return c.json({ message: "Verification email sent" }, 201);
    },
  )
  .post(
    "/verify-email",
    authRateLimit,
    validate("json", z.object({ emailAddress: sanitizedEmail, code: sanitizedText })),
    async (c) => {
      const { emailAddress, code } = c.req.valid("json");
      const { session, user } = await AuthenticationService.verifyEmail(emailAddress, code, getSessionCookie(c));
      setSessionCookie(c, session.id);
      return c.json(user, 200);
    },
  );
