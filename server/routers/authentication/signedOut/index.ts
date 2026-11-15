import { Hono } from "hono";
import { z } from "zod";

import { authEmailRateLimit, authRateLimit, setSessionCookie, validate } from "@/server/middlewares/index.ts";
import { sanitizedEmail, sanitizedText } from "@/server/routers/api/validation.ts";
import { checkPasswordConfirmation, sanitizedPassword } from "@/server/routers/authentication/validation.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";

/** An invite link's token, as its link carries it (`/sign-up?invite=…`). */
const inviteToken = z.string().min(1).max(200);

/** The route's param that names an invite link: its token. */
const inviteTokenParam = z.object({ token: inviteToken });

/**
 * What a signed-out user does: read who may sign up and what an invite link lets them do, sign up, verify their email,
 * sign in, reset their password.
 */
export default new Hono()
  // What an invite link's token reads as: whether it lets its opener sign up, nothing else of its link
  .get("/invite-links/:token", authRateLimit, validate("param", inviteTokenParam), async (c) => {
    const { token } = c.req.valid("param");
    return c.json(await AuthenticationService.getInviteLinkState(token), 200);
  })
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
    validate("json", z.object({ idToken: z.string().min(1), inviteToken: inviteToken.optional() })),
    async (c) => {
      const { idToken, inviteToken } = c.req.valid("json");
      const { session, user } = await AuthenticationService.signInWithGoogle(idToken, inviteToken);
      setSessionCookie(c, session.id);
      return c.json(user, 200);
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
          inviteToken: inviteToken.optional(),
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
