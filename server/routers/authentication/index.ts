import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { toJson } from "@/server/errors/index.ts";
import {
  authEmailRateLimit,
  authRateLimit,
  authSessionRateLimit,
  denyDemoUser,
  deleteSessionCookie,
  getSessionCookie,
  sessionMiddleware,
  setSessionCookie,
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
    const result = await AuthenticationService.initialize().call("signUp", body);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ message: "Verification email sent" }, 201);
  })
  .post("/verify-email", authRateLimit, zValidator("json", VerifyEmailJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call("verifyEmail", body, getSessionCookie(c));
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    const { session, user } = result[1];
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post("/resend-verification", authRateLimit, authEmailRateLimit, zValidator("json", ResendVerificationJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call("resendVerification", body);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ success: true }, 200);
  })
  .post("/forgot-password", authRateLimit, authEmailRateLimit, zValidator("json", ForgotPasswordJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call("forgotPassword", body);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ success: true }, 200);
  })
  .post("/reset-password", authRateLimit, zValidator("json", ResetPasswordJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call("resetPassword", body);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ success: true }, 200);
  })
  .post("/sign-in", authRateLimit, zValidator("json", SignInJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call("signIn", body, getSessionCookie(c));
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    const { session, user } = result[1];
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .post("/google", authRateLimit, zValidator("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call("signInWithGoogle", body, getSessionCookie(c));
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    const { session, user } = result[1];
    setSessionCookie(c, session.id);
    return c.json(user, 200);
  })
  .use(authSessionRateLimit)
  .use(sessionMiddleware)
  .get("/me", async (c) => {
    const result = await AuthenticationService.initialize().call("me", c.var.requestSession);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .get("/featurebase-token", async (c) => {
    const result = await AuthenticationService.initialize().call("featurebaseToken", c.var.requestSession);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .put("/profile", denyDemoUser, zValidator("json", UpdateProfileJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "updateProfile",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .put("/password", denyDemoUser, zValidator("json", UpdatePasswordJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "updatePassword",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .post("/set-password", denyDemoUser, zValidator("json", SetPasswordJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "setPassword",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .get("/linked-accounts", async (c) => {
    const result = await AuthenticationService.initialize().call(
      "getLinkedAccounts",
      c.var.requestSession,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .post("/link-google", denyDemoUser, zValidator("json", GoogleSignInJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "linkGoogleAccount",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .post("/unlink-oauth", denyDemoUser, zValidator("json", UnlinkOauthJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "unlinkOauthAccount",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .post("/verify-email-change", denyDemoUser, zValidator("json", VerifyEmailChangeJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "verifyEmailChange",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json(result[1], 200);
  })
  .post("/cancel-email-change", denyDemoUser, async (c) => {
    const result = await AuthenticationService.initialize().call(
      "cancelEmailChange",
      c.var.requestSession,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ success: true }, 200);
  })
  .post("/resend-email-change", denyDemoUser, async (c) => {
    const result = await AuthenticationService.initialize().call(
      "resendEmailChange",
      c.var.requestSession,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ success: true }, 200);
  })
  .post("/delete-account", denyDemoUser, zValidator("json", DeleteAccountJson), async (c) => {
    const body = c.req.valid("json");
    const result = await AuthenticationService.initialize().call(
      "deleteAccount",
      c.var.requestSession,
      body,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  })
  .post("/complete-onboarding", async (c) => {
    const result = await AuthenticationService.initialize().call(
      "completeOnboarding",
      c.var.requestSession,
    );
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    return c.json({ success: true }, 200);
  })
  .post("/sign-out", async (c) => {
    const result = await AuthenticationService.initialize().call("signOut", c.var.requestSession);
    const success = result[0];

    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    deleteSessionCookie(c);
    return c.json({ success: true }, 200);
  });
