import { Hono } from "hono";

import {
  authEmailRateLimit,
  authRateLimit,
  authSessionRateLimit,
  deleteSessionCookie,
  getSessionCookie,
  sessionMiddleware,
  setSessionCookie,
  validate,
} from "@/server/middlewares/index.ts";
import account from "@/server/routers/authentication/account/index.ts";
import linkedAccounts from "@/server/routers/authentication/linkedAccounts/index.ts";
import {
  ForgotPasswordJson,
  GoogleSignInJson,
  ResendVerificationJson,
  ResetPasswordJson,
  SignInJson,
  SignUpJson,
  VerifyEmailJson,
} from "@/server/routers/authentication/validation.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";

export default new Hono()
  .post("/forgot-password", authRateLimit, authEmailRateLimit, validate("json", ForgotPasswordJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.forgotPassword(body.emailAddress);
    return c.json({ success: true }, 200);
  })
  .post("/google", authRateLimit, validate("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.signInWithGoogle(body.idToken, getSessionCookie(c));
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post(
    "/resend-verification",
    authRateLimit,
    authEmailRateLimit,
    validate("json", ResendVerificationJson),
    async (c) => {
      const body = c.req.valid("json");
      await AuthenticationService.resendVerification(body.emailAddress);
      return c.json({ success: true }, 200);
    },
  )
  .post("/reset-password", authRateLimit, validate("json", ResetPasswordJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.resetPassword(body.emailAddress, body.code, body.newPassword);
    return c.json({ success: true }, 200);
  })
  .post("/sign-in", authRateLimit, validate("json", SignInJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.signIn(body.emailAddress, body.password, getSessionCookie(c));
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post("/sign-up", authRateLimit, authEmailRateLimit, validate("json", SignUpJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.signUp(body.emailAddress, body.password);
    return c.json({ message: "Verification email sent" }, 201);
  })
  .post("/verify-email", authRateLimit, validate("json", VerifyEmailJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.verifyEmail(
      body.emailAddress,
      body.code,
      getSessionCookie(c),
    );
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
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
