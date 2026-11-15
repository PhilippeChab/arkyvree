import { Hono } from "hono";
import { z } from "zod";

import {
  authEmailRateLimit,
  authRateLimit,
  inviteLinkRateLimit,
  setSessionCookie,
  validate,
} from "@/server/middlewares/index.ts";
import { sanitizedEmail, sanitizedText } from "@/server/routers/api/validation.ts";
import { checkPasswordConfirmation, sanitizedPassword } from "@/server/routers/authentication/validation.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";

/**
 * A link's token, as its link carries it: an invite link's (`/sign-up?invite=…`), a password reset link's
 * (`/reset-password-link?token=…`).
 */
const linkToken = z.string().min(1).max(200);

/**
 * What a signed-out user does: read who may sign up and what an invite link lets them do, sign up, verify their email,
 * sign in, reset their password (by an emailed code, or an admin's link).
 */
export default new Hono()
  // Who may make an account here: what the sign-up and sign-in pages show
  .get("/sign-up-policy", async (c) => c.json(await AuthenticationService.getSignUpPolicy(), 200))
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
  .post(
    "/google",
    authRateLimit,
    validate("json", z.object({ idToken: z.string().min(1), inviteToken: linkToken.optional() })),
    async (c) => {
      const { idToken, inviteToken } = c.req.valid("json");
      const { session, user } = await AuthenticationService.signInWithGoogle(idToken, inviteToken);
      setSessionCookie(c, session.id);
      return c.json(user, 200);
    },
  )
  // What an invite link's token reads as: whether it lets its opener sign up, nothing else of its link. Its token in the
  // body, never the path, which the request log and an error report keep
  .post("/invite-links/state", inviteLinkRateLimit, validate("json", z.object({ token: linkToken })), async (c) => {
    const { token } = c.req.valid("json");
    return c.json(await AuthenticationService.getInviteLinkState(token), 200);
  })
  // What a password reset link's token reads as: whether it resets a password, nothing of its account. Its token in the
  // body, never the path, which the request log and an error report keep
  .post("/password-reset-links/state", authRateLimit, validate("json", z.object({ token: linkToken })), async (c) => {
    const { token } = c.req.valid("json");
    return c.json(await AuthenticationService.getPasswordResetLinkState(token), 200);
  })
  .post(
    "/password-reset-links/use",
    authRateLimit,
    validate(
      "json",
      z
        .object({ token: linkToken, newPassword: sanitizedPassword, newPasswordConfirmation: sanitizedPassword })
        .check(checkPasswordConfirmation("newPassword")),
    ),
    async (c) => {
      const { token, newPassword } = c.req.valid("json");
      return c.json(await AuthenticationService.resetPasswordWithLink(token, newPassword), 200);
    },
  )
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
      const { session, user } = await AuthenticationService.signIn(emailAddress, password);
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
        .object({
          emailAddress: sanitizedEmail,
          inviteToken: linkToken.optional(),
          password: sanitizedPassword,
          passwordConfirmation: sanitizedPassword,
        })
        .check(checkPasswordConfirmation("password")),
    ),
    async (c) => {
      const { emailAddress, inviteToken, password } = c.req.valid("json");
      await AuthenticationService.signUp(emailAddress, password, inviteToken);
      return c.json({ message: "Verification email sent" }, 201);
    },
  )
  .post(
    "/verify-email",
    authRateLimit,
    validate("json", z.object({ emailAddress: sanitizedEmail, code: sanitizedText })),
    async (c) => {
      const { emailAddress, code } = c.req.valid("json");
      const { session, user } = await AuthenticationService.verifyEmail(emailAddress, code);
      setSessionCookie(c, session.id);
      return c.json(user, 200);
    },
  );
