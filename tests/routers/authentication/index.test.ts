import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { db } from "@/server/database/index.ts";
import { EmailVerifications, PasswordResets, Sessions, Users } from "@/server/repositories/index.ts";
import { describe, expect, test } from "bun:test";
import { testClient } from "hono/testing";

describe("authentication", () => {
  const api = testClient<Application>(application);
  const timestamp = Date.now();

  function getSessionCookie(setCookieHeader: string | null): string {
    if (!setCookieHeader) throw new Error("No set-cookie header found");
    const match = setCookieHeader.match(/session-id=([^;]+)/);
    if (!match) throw new Error("No session cookie found");
    return match[1];
  }

  // Helper: sign up + verify email, return session cookie
  async function signUpAndGetSession(email: string, password = "password1234") {
    const signUpResponse = await api.auth["sign-up"].$post({
      json: {
        emailAddress: email,
        password,
        passwordConfirmation: password,
      },
    });

    if (!signUpResponse.ok) {
      const error = await signUpResponse.json();
      throw new Error(error.message);
    }

    // Find the user and verification code
    const user = await Users.findOne(db, { emailAddress: email });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });

    const verifyResponse = await api.auth["verify-email"].$post({
      json: {
        emailAddress: email,
        code: verification!.code,
      },
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(error.message);
    }

    const setCookieHeader = verifyResponse.headers.get("set-cookie");
    return getSessionCookie(setCookieHeader);
  }

  test("should handle sign-up flow (returns 201, no session cookie)", async () => {
    const signUpResponse = await api.auth["sign-up"].$post({
      json: {
        emailAddress: `test+0+${timestamp}@example.com`,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    expect(signUpResponse.status).toBe(201);
    const body = await signUpResponse.json();
    expect((body as { message: string }).message).toBe("Verification email sent");

    // No session cookie
    const setCookieHeader = signUpResponse.headers.get("set-cookie");
    expect(setCookieHeader === null || !setCookieHeader.includes("session-id")).toBe(true);
  });

  test("POST /verify-email with valid code should return 200 + session cookie + user", async () => {
    const email = `test+verify+${timestamp}@example.com`;

    await api.auth["sign-up"].$post({
      json: {
        emailAddress: email,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    const user = await Users.findOne(db, { emailAddress: email });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });

    const verifyResponse = await api.auth["verify-email"].$post({
      json: {
        emailAddress: email,
        code: verification!.code,
      },
    });

    expect(verifyResponse.status).toBe(200);
    const body = await verifyResponse.json() as { id: string; emailAddress: string };
    expect(body.id).toBeDefined();
    expect(body.emailAddress).toBe(email);

    const setCookieHeader = verifyResponse.headers.get("set-cookie");
    expect(setCookieHeader).toBeTruthy();
    expect(setCookieHeader!.includes("session-id")).toBe(true);
  });

  test("POST /verify-email with invalid code should return error", async () => {
    const email = `test+badcode+${timestamp}@example.com`;

    await api.auth["sign-up"].$post({
      json: {
        emailAddress: email,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    const verifyResponse = await api.auth["verify-email"].$post({
      json: {
        emailAddress: email,
        code: "000000",
      },
    });

    expect(verifyResponse.status).toBe(401);
  });

  test("POST /resend-verification should return 200", async () => {
    const email = `test+resend+${timestamp}@example.com`;

    await api.auth["sign-up"].$post({
      json: {
        emailAddress: email,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    const resendResponse = await api.auth["resend-verification"].$post({
      json: { emailAddress: email },
    });

    expect(resendResponse.status).toBe(200);
    const body = await resendResponse.json();
    expect((body as { success: boolean }).success).toBe(true);
  });

  test("should handle sign-in flow", async () => {
    const email = `test+1+${timestamp}@example.com`;
    await signUpAndGetSession(email);

    // Then sign in
    const signInResponse = await api.auth["sign-in"].$post({
      json: {
        emailAddress: email,
        password: "password1234",
      },
    });

    if (!signInResponse.ok) {
      const error = await signInResponse.json();
      throw new Error(error.message);
    }

    const user = await signInResponse.json();
    expect(user.id).toBeDefined();
    expect(user.emailAddress).toBe(email);
  });

  test("POST /sign-in with unverified email should return 401", async () => {
    const email = `test+unverified+${timestamp}@example.com`;

    await api.auth["sign-up"].$post({
      json: {
        emailAddress: email,
        password: "password1234",
        passwordConfirmation: "password1234",
      },
    });

    const signInResponse = await api.auth["sign-in"].$post({
      json: {
        emailAddress: email,
        password: "password1234",
      },
    });

    expect(signInResponse.status).toBe(401);
    const error = await signInResponse.json();
    expect((error as { message: string }).message).toContain("Email not verified");
  });

  test("should handle me endpoint", async () => {
    const email = `test+2+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    const meResponse = await api.auth.me.$get({
      header: {
        cookie: `session-id=${sessionId}`,
      },
    });

    if (!meResponse.ok) {
      const error = await meResponse.json();
      throw new Error(error.message);
    }

    const user = await meResponse.json();
    expect(user.id).toBeDefined();
    expect(user.emailAddress).toBe(email);
  });

  test("should handle sign-out", async () => {
    const email = `test+3+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    // Sign out
    const signOutResponse = await api.auth["sign-out"].$post({
      header: {
        cookie: `session-id=${sessionId}`,
      },
    });

    expect(signOutResponse.ok).toBe(true);

    // Try to access me endpoint with old session
    const meResponse = await api.auth.me.$get({
      header: {
        cookie: `session-id=${sessionId}`,
      },
    });

    expect(meResponse.status).toBe(401);
  });

  test("should reject expired session on GET /me", async () => {
    const email = `test+expired+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    // Manually expire the session in the database
    const session = await Sessions.findOne(db, { id: sessionId });
    await Sessions.update(db, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { id: session!.id });

    const meResponse = await api.auth.me.$get({
      header: {
        cookie: `session-id=${sessionId}`,
      },
    });

    expect(meResponse.status).toBe(401);
  });

  test("should handle profile update with email change (sets pendingEmailAddress)", async () => {
    const email = `test+4+${timestamp}@example.com`;
    const newEmail = `test+4+updated+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    const profileResponse = await api.auth.profile.$put(
      {
        json: {
          username: "testusername",
          emailAddress: newEmail,
        },
      },
      {
        headers: {
          cookie: `session-id=${sessionId}`,
        },
      }
    );

    if (!profileResponse.ok) {
      const error = await profileResponse.json();
      throw new Error(error.message);
    }

    const updatedUser = await profileResponse.json();
    expect(updatedUser.username).toBe("testusername");
    expect(updatedUser.emailAddress).toBe(email);
    expect((updatedUser as { pendingEmailAddress: string }).pendingEmailAddress).toBe(newEmail);
  });

  test("should reject profile update with duplicate email", async () => {
    const emailA = `test+5a+${timestamp}@example.com`;
    const emailB = `test+5b+${timestamp}@example.com`;

    await signUpAndGetSession(emailA);
    const sessionId = await signUpAndGetSession(emailB);

    // Try to update second user's email to first user's email
    const profileResponse = await api.auth.profile.$put(
      {
        json: {
          emailAddress: emailA,
        },
      },
      {
        headers: {
          cookie: `session-id=${sessionId}`,
        },
      }
    );

    expect(profileResponse.status).toBe(400);
    const error = await profileResponse.json();
    expect((error as { message: string }).message).toContain("Email address already in use");
  });

  test("should handle password update with valid data", async () => {
    const email = `test+6+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    // Update password
    const passwordResponse = await api.auth.password.$put(
      {
        json: {
          currentPassword: "password1234",
          newPassword: "newpassword456",
          newPasswordConfirmation: "newpassword456",
        },
      },
      {
        headers: {
          cookie: `session-id=${sessionId}`,
        },
      }
    );

    if (!passwordResponse.ok) {
      const error = await passwordResponse.json();
      throw new Error(error.message);
    }

    const result = await passwordResponse.json();
    expect(result.success).toBe(true);

    // Verify new password works
    const signInResponse = await api.auth["sign-in"].$post({
      json: {
        emailAddress: email,
        password: "newpassword456",
      },
    });

    expect(signInResponse.ok).toBe(true);
  });

  test("should reject password update with incorrect current password", async () => {
    const email = `test+7+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    // Try to update password with wrong current password
    const passwordResponse = await api.auth.password.$put(
      {
        json: {
          currentPassword: "wrongpassword",
          newPassword: "newpassword456",
          newPasswordConfirmation: "newpassword456",
        },
      },
      {
        headers: {
          cookie: `session-id=${sessionId}`,
        },
      }
    );

    expect(passwordResponse.status).toBe(401);
    const error = await passwordResponse.json();
    expect((error as { message: string }).message).toContain("Current password is incorrect");
  });

  test("POST /forgot-password should return 200", async () => {
    const email = `test+forgot+${timestamp}@example.com`;
    await signUpAndGetSession(email);

    const response = await api.auth["forgot-password"].$post({
      json: { emailAddress: email },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect((body as { success: boolean }).success).toBe(true);
  });

  test("POST /reset-password with valid code should return 200", async () => {
    const email = `test+reset+${timestamp}@example.com`;
    await signUpAndGetSession(email);

    await api.auth["forgot-password"].$post({
      json: { emailAddress: email },
    });

    const user = await Users.findOne(db, { emailAddress: email });
    const reset = await PasswordResets.findOne(db, { userId: user!.id });

    const response = await api.auth["reset-password"].$post({
      json: {
        emailAddress: email,
        code: reset!.code,
        newPassword: "newpassword789",
        newPasswordConfirmation: "newpassword789",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect((body as { success: boolean }).success).toBe(true);
  });

  test("POST /reset-password with invalid code should return 401", async () => {
    const email = `test+resetbad+${timestamp}@example.com`;
    await signUpAndGetSession(email);

    await api.auth["forgot-password"].$post({
      json: { emailAddress: email },
    });

    const response = await api.auth["reset-password"].$post({
      json: {
        emailAddress: email,
        code: "000000",
        newPassword: "newpassword789",
        newPasswordConfirmation: "newpassword789",
      },
    });

    expect(response.status).toBe(401);
  });

  test("should sign in with new password after reset", async () => {
    const email = `test+resetlogin+${timestamp}@example.com`;
    await signUpAndGetSession(email);

    await api.auth["forgot-password"].$post({
      json: { emailAddress: email },
    });

    const user = await Users.findOne(db, { emailAddress: email });
    const reset = await PasswordResets.findOne(db, { userId: user!.id });

    await api.auth["reset-password"].$post({
      json: {
        emailAddress: email,
        code: reset!.code,
        newPassword: "resetpassword1234",
        newPasswordConfirmation: "resetpassword1234",
      },
    });

    const signInResponse = await api.auth["sign-in"].$post({
      json: {
        emailAddress: email,
        password: "resetpassword1234",
      },
    });

    expect(signInResponse.status).toBe(200);
  });

  test("POST /verify-email-change with valid code should return user with new email", async () => {
    const email = `test+emailchange+${timestamp}@example.com`;
    const newEmail = `test+emailchange+new+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    // Trigger email change
    await api.auth.profile.$put(
      { json: { emailAddress: newEmail } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    // Get verification code
    const user = await Users.findOne(db, { emailAddress: email });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });

    const response = await api.auth["verify-email-change"].$post(
      { json: { code: verification!.code } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { emailAddress: string; pendingEmailAddress: string | null };
    expect(body.emailAddress).toBe(newEmail);
    expect(body.pendingEmailAddress).toBeNull();
  });

  test("POST /verify-email-change with invalid code should return 401", async () => {
    const email = `test+emailchangebad+${timestamp}@example.com`;
    const newEmail = `test+emailchangebad+new+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    await api.auth.profile.$put(
      { json: { emailAddress: newEmail } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    const response = await api.auth["verify-email-change"].$post(
      { json: { code: "000000" } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    expect(response.status).toBe(401);
  });

  test("POST /cancel-email-change should return 200", async () => {
    const email = `test+cancelchange+${timestamp}@example.com`;
    const newEmail = `test+cancelchange+new+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    await api.auth.profile.$put(
      { json: { emailAddress: newEmail } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    const response = await api.auth["cancel-email-change"].$post(
      {},
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect((body as { success: boolean }).success).toBe(true);
  });

  test("POST /delete-account with correct password should return 200 and clear session cookie", async () => {
    const email = `test+delete+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    const response = await api.auth["delete-account"].$post(
      { json: { password: "password1234" } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect((body as { success: boolean }).success).toBe(true);

    // Session cookie should be cleared
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toBeTruthy();
    expect(setCookieHeader!.includes("session-id=")).toBe(true);
  });

  test("POST /delete-account with wrong password should return 401", async () => {
    const email = `test+deletebad+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    const response = await api.auth["delete-account"].$post(
      { json: { password: "wrongpassword" } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    expect(response.status).toBe(401);
  });

  test("GET /me after account deletion should return 401", async () => {
    const email = `test+deleteme+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    await api.auth["delete-account"].$post(
      { json: { password: "password1234" } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    const meResponse = await api.auth.me.$get({
      header: { cookie: `session-id=${sessionId}` },
    });

    expect(meResponse.status).toBe(401);
  });

  test("POST /resend-email-change should return 200", async () => {
    const email = `test+resendchange+${timestamp}@example.com`;
    const newEmail = `test+resendchange+new+${timestamp}@example.com`;
    const sessionId = await signUpAndGetSession(email);

    await api.auth.profile.$put(
      { json: { emailAddress: newEmail } },
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    // Age the verification past cooldown
    const user = await Users.findOne(db, { emailAddress: email });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });
    await EmailVerifications.update(db, { createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() }, { id: verification!.id });

    const response = await api.auth["resend-email-change"].$post(
      {},
      { headers: { cookie: `session-id=${sessionId}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect((body as { success: boolean }).success).toBe(true);
  });
});
