import { Hono } from "hono";

import {
  authEmailRateLimit,
  authRateLimit,
  authSessionRateLimit,
  deleteSessionCookie,
  denyDemoUser,
  getSessionCookie,
  sessionMiddleware,
  setSessionCookie,
  zValidator,
} from "@/server/middlewares/index.ts";
import {
  DeleteAccountJson,
  ForgotPasswordJson,
  GoogleSignInJson,
  ResendVerificationJson,
  ResetPasswordJson,
  SetPasswordJson,
  SignInJson,
  SignUpJson,
  UnlinkOauthJson,
  UpdatePasswordJson,
  UpdateProfileJson,
  VerifyEmailChangeJson,
  VerifyEmailJson,
} from "@/server/routers/authentication/validation.ts";
import { AuthenticationService } from "@/server/services/index.ts";

export default new Hono()
  .post("/sign-up", authRateLimit, authEmailRateLimit, zValidator("json", SignUpJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.signUp(body.emailAddress, body.password);
    return c.json({ message: "Verification email sent" }, 201);
  })
  .post("/verify-email", authRateLimit, zValidator("json", VerifyEmailJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.verifyEmail(
      body.emailAddress,
      body.code,
      getSessionCookie(c),
    );
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post(
    "/resend-verification",
    authRateLimit,
    authEmailRateLimit,
    zValidator("json", ResendVerificationJson),
    async (c) => {
      const body = c.req.valid("json");
      await AuthenticationService.resendVerification(body.emailAddress);
      return c.json({ success: true }, 200);
    },
  )
  .post("/forgot-password", authRateLimit, authEmailRateLimit, zValidator("json", ForgotPasswordJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.forgotPassword(body.emailAddress);
    return c.json({ success: true }, 200);
  })
  .post("/reset-password", authRateLimit, zValidator("json", ResetPasswordJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.resetPassword(body.emailAddress, body.code, body.newPassword);
    return c.json({ success: true }, 200);
  })
  .post("/sign-in", authRateLimit, zValidator("json", SignInJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.signIn(body.emailAddress, body.password, getSessionCookie(c));
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post("/google", authRateLimit, zValidator("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.signInWithGoogle(body.idToken, getSessionCookie(c));
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .use(authSessionRateLimit)
  .use(sessionMiddleware)
  .get("/me", async (c) => {
    return c.json(await AuthenticationService.me(c.var.requestSession), 200);
  })
  .put("/profile", denyDemoUser, zValidator("json", UpdateProfileJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(
      await AuthenticationService.updateProfile(c.var.requestSession, body.username, body.emailAddress),
      200,
    );
  })
  .put("/password", denyDemoUser, zValidator("json", UpdatePasswordJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(
      await AuthenticationService.updatePassword(c.var.requestSession, body.currentPassword, body.newPassword),
      200,
    );
  })
  .post("/set-password", denyDemoUser, zValidator("json", SetPasswordJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AuthenticationService.setPassword(c.var.requestSession, body.newPassword), 200);
  })
  .get("/linked-accounts", async (c) => {
    return c.json(await AuthenticationService.getLinkedAccounts(c.var.requestSession), 200);
  })
  .post("/link-google", denyDemoUser, zValidator("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AuthenticationService.linkGoogleAccount(c.var.requestSession, body.idToken), 200);
  })
  .post("/unlink-oauth", denyDemoUser, zValidator("json", UnlinkOauthJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AuthenticationService.unlinkOauthAccount(c.var.requestSession, body.provider), 200);
  })
  .post("/verify-email-change", denyDemoUser, zValidator("json", VerifyEmailChangeJson), async (c) => {
    const body = c.req.valid("json");
    return c.json(await AuthenticationService.verifyEmailChange(c.var.requestSession, body.code), 200);
  })
  .post("/cancel-email-change", denyDemoUser, async (c) => {
    await AuthenticationService.cancelEmailChange(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/resend-email-change", denyDemoUser, async (c) => {
    await AuthenticationService.resendEmailChange(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/delete-account", denyDemoUser, zValidator("json", DeleteAccountJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.deleteAccount(c.var.requestSession, body.password);
    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  })
  .post("/complete-onboarding", async (c) => {
    await AuthenticationService.completeOnboarding(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/sign-out", async (c) => {
    await AuthenticationService.signOut(c.var.requestSession);
    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  });
