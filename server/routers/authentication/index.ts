import { Hono } from "hono";

import {
  authEmailRateLimit,
  authRateLimit,
  authSessionRateLimit,
  deleteSessionCookie,
  getSessionCookie,
  sessionMiddleware,
  setSessionCookie,
  zValidator,
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
  .post("/forgot-password", authRateLimit, authEmailRateLimit, zValidator("json", ForgotPasswordJson), async (c) => {
    const body = c.req.valid("json");
    await AuthenticationService.forgotPassword(body.emailAddress);
    return c.json({ success: true }, 200);
  })
  .post("/google", authRateLimit, zValidator("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    const { session, user } = await AuthenticationService.signInWithGoogle(body.idToken, getSessionCookie(c));
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
  .use(authSessionRateLimit)
  .use(sessionMiddleware)
  .get("/me", async (c) => {
    return c.json(await AuthenticationService.me(c.var.requestSession), 200);
  })
  .route("/", account)
  .route("/", linkedAccounts)
  .post("/sign-out", async (c) => {
    await AuthenticationService.signOut(c.var.requestSession);
    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  });
