import { AuthenticationMethods } from "@/server/services/AuthenticationService.ts";
import { db } from "@/server/database/index.ts";
import { Campaigns, Characters, EmailVerifications, Invites, PasswordResets, Players, Rulesets, Sessions, Users } from "@/server/repositories/index.ts";
import { CampaignInvitesMethods } from "@/server/services/campaigns/InvitesService.ts";
import { BadRequestError, ConflictError, UnauthorizedError, InternalError } from "@/server/errors/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("AuthenticationService", () => {
  let seedCtx: SeedContext;
  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  // Helper to create unique test data
  function createTestData() {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    return {
      emailAddress: `test-${uniqueId}@example.com`,
      password: `password-${uniqueId}`,
      passwordConfirmation: `password-${uniqueId}`,
    };
  }

  // Helper to sign up and verify a user, returning session + user
  async function signUpAndVerify(testData: { emailAddress: string; password: string; passwordConfirmation: string }) {
    const signUpResult = await AuthenticationMethods.signUp({
      emailAddress: testData.emailAddress,
      password: testData.password,
      passwordConfirmation: testData.passwordConfirmation,
    });

    // Verify the email directly
    await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: signUpResult.user.id });

    // Sign in to get a session
    const signInResult = await AuthenticationMethods.signIn({
      emailAddress: testData.emailAddress,
      password: testData.password,
    });

    return signInResult;
  }

  describe("signUp", () => {
    test("should create a new user (unverified, no session)", async () => {
      const testData = createTestData();

      const result = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.emailAddress).toBe(testData.emailAddress);
      expect(result.user.emailVerifiedAt).toBeNull();
      expect("session" in result).toBe(false);
    });

    test("should create user with Argon2 hashed password", async () => {
      const testData = createTestData();

      const result = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      expect(result.user.passwordDigest).not.toBe(testData.password);
      expect(result.user.passwordDigest).toStartWith("$argon2");
    });

    test("should create an email verification record", async () => {
      const testData = createTestData();

      const result = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      const verification = await EmailVerifications.findOne(db, { userId: result.user.id });
      expect(verification).toBeDefined();
      expect(verification!.code).toHaveLength(8);
      expect(new Date(verification!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    test("should throw BadRequestError when passwords do not match", async () => {
      const testData = createTestData();

      await expect(
        AuthenticationMethods.signUp({
          emailAddress: testData.emailAddress,
          password: testData.password,
          passwordConfirmation: "different-password",
        })
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw BadRequestError with correct message when passwords do not match", async () => {
      const testData = createTestData();

      try {
        await AuthenticationMethods.signUp({
          emailAddress: testData.emailAddress,
          password: testData.password,
          passwordConfirmation: "different-password",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as BadRequestError).message).toBe("Passwords do not match");
      }
    });
  });

  describe("verifyEmail", () => {
    test("should verify with correct code and return session + user", async () => {
      const testData = createTestData();

      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      const verification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });

      const result = await AuthenticationMethods.verifyEmail({
        emailAddress: testData.emailAddress,
        code: verification!.code,
      });

      expect(result.session).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.session.userId).toBe(signUpResult.user.id);
    });

    test("should reject wrong code", async () => {
      const testData = createTestData();

      await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      await expect(
        AuthenticationMethods.verifyEmail({
          emailAddress: testData.emailAddress,
          code: "000000",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should reject expired code", async () => {
      const testData = createTestData();

      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      const verification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });

      // Expire the verification
      await EmailVerifications.update(db, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { id: verification!.id });

      await expect(
        AuthenticationMethods.verifyEmail({
          emailAddress: testData.emailAddress,
          code: verification!.code,
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should reject already-verified user", async () => {
      const testData = createTestData();

      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      const verification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });

      // Verify first time
      await AuthenticationMethods.verifyEmail({
        emailAddress: testData.emailAddress,
        code: verification!.code,
      });

      // Try to verify again
      await expect(
        AuthenticationMethods.verifyEmail({
          emailAddress: testData.emailAddress,
          code: verification!.code,
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("resendVerification", () => {
    test("should invalidate old codes and send new one", async () => {
      const testData = createTestData();

      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      const oldVerification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });

      // Age the verification past the 5-minute cooldown
      await EmailVerifications.update(db, { createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() }, { id: oldVerification!.id });

      await AuthenticationMethods.resendVerification({
        emailAddress: testData.emailAddress,
      });

      const newVerification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });
      expect(newVerification).toBeDefined();
      expect(newVerification!.id).not.toBe(oldVerification!.id);
      expect(newVerification!.code).toHaveLength(8);
    });

    test("should silently succeed for non-existent email", async () => {
      const result = await AuthenticationMethods.resendVerification({
        emailAddress: "nonexistent@example.com",
      });

      expect(result.success).toBe(true);
    });

    test("should silently succeed for already-verified email", async () => {
      const testData = createTestData();

      await signUpAndVerify(testData);

      const result = await AuthenticationMethods.resendVerification({
        emailAddress: testData.emailAddress,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("signIn", () => {
    test("should sign in user with correct credentials", async () => {
      const testData = createTestData();

      const { user: signUpUser } = await signUpAndVerify(testData);

      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      expect(signInResult).toBeDefined();
      expect(signInResult.user).toBeDefined();
      expect(signInResult.session).toBeDefined();
      expect(signInResult.user.id).toBe(signUpUser.id);
      expect(signInResult.user.emailAddress).toBe(testData.emailAddress);
    });

    test("should create a new session on sign in", async () => {
      const testData = createTestData();

      const { session: firstSession } = await signUpAndVerify(testData);

      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      expect(signInResult.session.id).not.toBe(firstSession.id);
    });

    test("should throw UnauthorizedError for non-existent user", async () => {
      await expect(
        AuthenticationMethods.signIn({
          emailAddress: "nonexistent@example.com",
          password: "password1234",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should throw UnauthorizedError with correct message for non-existent user", async () => {
      try {
        await AuthenticationMethods.signIn({
          emailAddress: "nonexistent@example.com",
          password: "password1234",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect((error as UnauthorizedError).message).toBe("Invalid email or password");
      }
    });

    test("should throw UnauthorizedError for incorrect password", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.signIn({
          emailAddress: testData.emailAddress,
          password: "wrong-password",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should throw UnauthorizedError with correct message for incorrect password", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      try {
        await AuthenticationMethods.signIn({
          emailAddress: testData.emailAddress,
          password: "wrong-password",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect((error as UnauthorizedError).message).toBe("Invalid email or password");
      }
    });

    test("should reject unverified user with 'Email not verified'", async () => {
      const testData = createTestData();

      await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      try {
        await AuthenticationMethods.signIn({
          emailAddress: testData.emailAddress,
          password: testData.password,
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect((error as UnauthorizedError).message).toBe("Email not verified");
      }
    });

    test("should rehash legacy SHA-256 password to Argon2 on sign in", async () => {
      const testData = createTestData();

      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: signUpResult.user.id });

      // Manually set a legacy SHA-256 hash
      const messageBuffer = new TextEncoder().encode(testData.password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
      const sha256Hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      await Users.update(db, { passwordDigest: sha256Hash }, { id: signUpResult.user.id });

      // Verify the hash is SHA-256 (not Argon2)
      const userBefore = await Users.findOne(db, { id: signUpResult.user.id });
      expect(userBefore!.passwordDigest).not.toStartWith("$argon2");

      // Sign in — should succeed and rehash
      await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      // Verify the hash is now Argon2
      const userAfter = await Users.findOne(db, { id: signUpResult.user.id });
      expect(userAfter!.passwordDigest).toStartWith("$argon2");
    });

    test("should create session with expiresAt ~7 days from now", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      const before = Date.now();
      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });
      const after = Date.now();

      const expiresAt = new Date(signInResult.session.expiresAt).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDaysMs);
      expect(expiresAt).toBeLessThanOrEqual(after + sevenDaysMs);
    });

    test("should create session with valid timestamps on sign in", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      expect(signInResult.session.createdAt).toBeDefined();
      expect(signInResult.session.updatedAt).toBeDefined();
      expect(new Date(signInResult.session.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("signOut", () => {
    test("should archive the session on sign out", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await AuthenticationMethods.signOut(session);

      const archivedSession = await Sessions.findOne(db, { id: session.id });
      expect(archivedSession).toBeUndefined();
    });

    test("should handle sign out for valid session", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await AuthenticationMethods.signOut(session);

      const archivedSession = await Sessions.findOne(db, { id: session.id });
      expect(archivedSession).toBeUndefined();
    });

    test("should throw InternalError for non-existent session", async () => {
      const fakeSession: Session = {
        id: "00000000-0000-0000-0000-000000000000",
        userId: "00000000-0000-0000-0000-000000000000",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await expect(
        AuthenticationMethods.signOut(fakeSession)
      ).rejects.toThrow(InternalError);
    });

    test("should throw InternalError with correct message for non-existent session", async () => {
      const fakeSession: Session = {
        id: "00000000-0000-0000-0000-000000000000",
        userId: "00000000-0000-0000-0000-000000000000",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      try {
        await AuthenticationMethods.signOut(fakeSession);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(InternalError);
        expect((error as InternalError).message).toBe("Session not found");
      }
    });

    test("hard-deletes a demo user on sign out (no ghost)", async () => {
      const demo = await AuthenticationMethods.startDemo();
      await AuthenticationMethods.signOut(demo.session);

      expect(await Users.findOne(db, { id: demo.user.id })).toBeUndefined();
      expect(await Sessions.findOne(db, { id: demo.session.id })).toBeUndefined();
    });
  });

  describe("startDemo", () => {
    test("creates a demo user with synthetic email, verified, and a TTL", async () => {
      const result = await AuthenticationMethods.startDemo();
      expect(result.reused).toBe(false);
      expect(result.user.emailAddress).toMatch(/^demo-[0-9a-f-]+@demo\.invalid$/);
      expect(result.user.emailVerifiedAt).not.toBeNull();
      const userExpiresAt = result.user.expiresAt;
      expect(userExpiresAt).not.toBeNull();
      expect(new Date(userExpiresAt!).getTime()).toBeGreaterThan(Date.now());
      // Session lifetime mirrors the demo user's TTL.
      expect(result.session.expiresAt).toBe(userExpiresAt!);
    });

    test("reuses an existing valid demo session when its cookie is presented", async () => {
      const first = await AuthenticationMethods.startDemo();
      const second = await AuthenticationMethods.startDemo(first.session.id);
      expect(second.reused).toBe(true);
      expect(second.session.id).toBe(first.session.id);
      expect(second.user.id).toBe(first.user.id);
    });

    test("ignores an unknown cookie and mints a fresh demo user", async () => {
      const result = await AuthenticationMethods.startDemo("00000000-0000-0000-0000-000000000000");
      expect(result.reused).toBe(false);
    });

    test("rejects a real user's session — would otherwise replace their cookie with a demo cookie", async () => {
      const testData = createTestData();
      const { session: realSession } = await signUpAndVerify(testData);
      await expect(AuthenticationMethods.startDemo(realSession.id)).rejects.toThrow(BadRequestError);
    });

    test("starting a demo never recycles or touches existing rows", async () => {
      // Sweeping is the cron's job (runCleanup), not the request path's. A
      // second start mints a fresh user and leaves the expired one alone.
      const expired = await AuthenticationMethods.startDemo();
      await Users.update(
        db,
        { expiresAt: new Date(Date.now() - 1000).toISOString() },
        { id: expired.user.id },
      );

      const fresh = await AuthenticationMethods.startDemo();
      expect(fresh.user.id).not.toBe(expired.user.id);

      const stillThere = await Users.findOne(db, { id: expired.user.id });
      expect(stillThere?.id).toBe(expired.user.id);
    });

    test("hard-deletes the demo user when the requester signs in with a real account", async () => {
      const demo = await AuthenticationMethods.startDemo();

      // Set up a real account and sign in while still holding the demo cookie.
      const testData = createTestData();
      const signUp = await AuthenticationMethods.signUp(testData);
      await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: signUp.user.id });
      const result = await AuthenticationMethods.signIn(
        { emailAddress: testData.emailAddress, password: testData.password },
        demo.session.id,
      );

      expect(result.user.emailAddress).toBe(testData.emailAddress);
      // The demo user (and CASCADE its session/data) is gone.
      const lingering = await Users.findOne(db, { id: demo.user.id });
      expect(lingering).toBeUndefined();
    });

    test("leaves the demo user alone when sign-in fails", async () => {
      const demo = await AuthenticationMethods.startDemo();
      const testData = createTestData();
      const signUp = await AuthenticationMethods.signUp(testData);
      await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: signUp.user.id });

      await expect(
        AuthenticationMethods.signIn(
          { emailAddress: testData.emailAddress, password: "wrong-password" },
          demo.session.id,
        ),
      ).rejects.toThrow(UnauthorizedError);

      // The demo user is still there because the auth failed before the purge runs.
      const stillThere = await Users.findOne(db, { id: demo.user.id });
      expect(stillThere).toBeDefined();
    });

    test("hard-deletes the demo user when the requester completes verifyEmail", async () => {
      const demo = await AuthenticationMethods.startDemo();
      const testData = createTestData();
      const signUp = await AuthenticationMethods.signUp(testData);
      const verification = await EmailVerifications.findOne(db, { userId: signUp.user.id });

      const result = await AuthenticationMethods.verifyEmail(
        { emailAddress: testData.emailAddress, code: verification!.code },
        demo.session.id,
      );

      expect(result.user.emailAddress).toBe(testData.emailAddress);
      const lingering = await Users.findOne(db, { id: demo.user.id });
      expect(lingering).toBeUndefined();
    });
  });

  describe("me", () => {
    test("should return user data for valid session", async () => {
      const testData = createTestData();
      const { session, user } = await signUpAndVerify(testData);

      const currentUser = await AuthenticationMethods.me(session);

      expect(currentUser).toBeDefined();
      expect(currentUser.id).toBe(user.id);
      expect(currentUser.emailAddress).toBe(testData.emailAddress);
    });

    test("should not return passwordDigest in user data", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      const currentUser = await AuthenticationMethods.me(session);

      expect(currentUser).toBeDefined();
      expect("passwordDigest" in currentUser).toBe(false);
    });

    test("should throw InternalError for session with non-existent user", async () => {
      const fakeSession: Session = {
        id: "00000000-0000-0000-0000-000000000000",
        userId: "00000000-0000-0000-0000-000000000000",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await expect(
        AuthenticationMethods.me(fakeSession)
      ).rejects.toThrow(InternalError);
    });

    test("should throw InternalError with correct message for non-existent user", async () => {
      const fakeSession: Session = {
        id: "00000000-0000-0000-0000-000000000000",
        userId: "00000000-0000-0000-0000-000000000000",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      try {
        await AuthenticationMethods.me(fakeSession);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(InternalError);
        expect((error as InternalError).message).toBe("User not found");
      }
    });

    test("should return user with all expected fields except passwordDigest", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      const currentUser = await AuthenticationMethods.me(session);

      expect(currentUser).toBeDefined();
      expect(currentUser.id).toBeDefined();
      expect(currentUser.emailAddress).toBeDefined();
      expect(currentUser.createdAt).toBeDefined();
      expect(currentUser.updatedAt).toBeDefined();
      expect("passwordDigest" in currentUser).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    test("should allow multiple sign-ins for same user", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      const signIn1 = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      const signIn2 = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      expect(signIn1.session.id).not.toBe(signIn2.session.id);
      expect(signIn1.user.id).toBe(signIn2.user.id);
    });

    test("should complete full authentication cycle: signup -> verify -> signin -> me -> signout", async () => {
      const testData = createTestData();

      // Sign up
      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: testData.emailAddress,
        password: testData.password,
        passwordConfirmation: testData.passwordConfirmation,
      });

      expect(signUpResult.user).toBeDefined();
      expect("session" in signUpResult).toBe(false);

      // Verify email
      const verification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });
      const verifyResult = await AuthenticationMethods.verifyEmail({
        emailAddress: testData.emailAddress,
        code: verification!.code,
      });

      expect(verifyResult.session).toBeDefined();
      expect(verifyResult.user.id).toBe(signUpResult.user.id);

      // Sign in
      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      expect(signInResult.user.id).toBe(signUpResult.user.id);

      // Get current user
      const currentUser = await AuthenticationMethods.me(signInResult.session);

      expect(currentUser.id).toBe(signUpResult.user.id);
      expect("passwordDigest" in currentUser).toBe(false);

      // Sign out
      await AuthenticationMethods.signOut(signInResult.session);

      // Verify session is archived
      const archivedSession = await Sessions.findOne(db, { id: signInResult.session.id });
      expect(archivedSession).toBeUndefined();
    });

    test("should not allow signin after user creation with wrong password", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.signIn({
          emailAddress: testData.emailAddress,
          password: "definitely-wrong-password",
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("updateProfile", () => {
    test("should update username successfully", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      const updatedUser = await AuthenticationMethods.updateProfile(session, {
        username: "newusername",
        emailAddress: undefined,
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser.username).toBe("newusername");
      expect(updatedUser.emailAddress).toBe(testData.emailAddress);
      expect("passwordDigest" in updatedUser).toBe(false);
    });

    test("should set pendingEmailAddress on email change, not change emailAddress", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session } = await signUpAndVerify(testData);

      const updatedUser = await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser.emailAddress).toBe(testData.emailAddress);
      expect(updatedUser.pendingEmailAddress).toBe(newEmail);
    });

    test("should create verification record on email change", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session, user } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      const verification = await EmailVerifications.findOne(db, { userId: user.id });
      expect(verification).toBeDefined();
      expect(verification!.code).toHaveLength(8);
      expect(new Date(verification!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    test("should update username without affecting email (no pending email)", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      const updatedUser = await AuthenticationMethods.updateProfile(session, {
        username: "justusername",
        emailAddress: undefined,
      });

      expect(updatedUser.username).toBe("justusername");
      expect(updatedUser.pendingEmailAddress).toBeNull();
    });

    test("should reject duplicate email", async () => {
      const testData1 = createTestData();
      const testData2 = createTestData();

      await signUpAndVerify(testData1);
      const { session: session2 } = await signUpAndVerify(testData2);

      await expect(
        AuthenticationMethods.updateProfile(session2, {
          username: undefined,
          emailAddress: testData1.emailAddress,
        })
      ).rejects.toThrow(BadRequestError);
    });

    test("should reject duplicate username", async () => {
      const testData1 = createTestData();
      const testData2 = createTestData();

      const { session: session1 } = await signUpAndVerify(testData1);

      await AuthenticationMethods.updateProfile(session1, {
        username: "uniqueusername",
        emailAddress: undefined,
      });

      const { session: session2 } = await signUpAndVerify(testData2);

      await expect(
        AuthenticationMethods.updateProfile(session2, {
          username: "uniqueusername",
          emailAddress: undefined,
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("verifyEmailChange", () => {
    test("should swap email on valid code", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session, user } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      const verification = await EmailVerifications.findOne(db, { userId: user.id });

      const result = await AuthenticationMethods.verifyEmailChange(session, {
        code: verification!.code,
      });

      expect(result.emailAddress).toBe(newEmail);
      expect(result.pendingEmailAddress).toBeNull();
    });

    test("should reject invalid code", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      await expect(
        AuthenticationMethods.verifyEmailChange(session, { code: "000000" })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should reject expired code", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session, user } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      const verification = await EmailVerifications.findOne(db, { userId: user.id });
      await EmailVerifications.update(db, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { id: verification!.id });

      await expect(
        AuthenticationMethods.verifyEmailChange(session, { code: verification!.code })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should reject when no pending email change", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.verifyEmailChange(session, { code: "123456" })
      ).rejects.toThrow(BadRequestError);
    });

    test("should reject if new email was claimed by another user", async () => {
      const testData1 = createTestData();
      const { session: session1, user: user1 } = await signUpAndVerify(testData1);

      // Set pending email to a unique address
      const contestedEmail = `contested-${Math.random().toString(36).substr(2, 9)}@example.com`;
      await AuthenticationMethods.updateProfile(session1, {
        username: undefined,
        emailAddress: contestedEmail,
      });

      const verification = await EmailVerifications.findOne(db, { userId: user1.id });

      // Another user claims that email before verification
      const otherData = createTestData();
      const otherResult = await AuthenticationMethods.signUp(otherData);
      await Users.update(db, {
        emailAddress: contestedEmail,
        emailVerifiedAt: new Date().toISOString(),
      }, { id: otherResult.user.id });

      await expect(
        AuthenticationMethods.verifyEmailChange(session1, { code: verification!.code })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("cancelEmailChange", () => {
    test("should clear pendingEmailAddress", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session, user } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      await AuthenticationMethods.cancelEmailChange(session);

      const updatedUser = await Users.findOne(db, { id: user.id });
      expect(updatedUser!.pendingEmailAddress).toBeNull();
    });
  });

  describe("resendEmailChange", () => {
    test("should create new verification code", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session, user } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      const oldVerification = await EmailVerifications.findOne(db, { userId: user.id });

      // Age the verification past the 5-minute cooldown
      await EmailVerifications.update(db, { createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() }, { id: oldVerification!.id });

      const result = await AuthenticationMethods.resendEmailChange(session);
      expect(result.success).toBe(true);

      const newVerification = await EmailVerifications.findOne(db, { userId: user.id });
      expect(newVerification).toBeDefined();
      expect(newVerification!.id).not.toBe(oldVerification!.id);
    });

    test("should respect 5-minute cooldown", async () => {
      const testData = createTestData();
      const newEmail = `new-${testData.emailAddress}`;
      const { session } = await signUpAndVerify(testData);

      await AuthenticationMethods.updateProfile(session, {
        username: undefined,
        emailAddress: newEmail,
      });

      // Immediately try to resend — should hit cooldown
      await expect(
        AuthenticationMethods.resendEmailChange(session)
      ).rejects.toThrow(BadRequestError);
    });

    test("should reject when no pending email change", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.resendEmailChange(session)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("updatePassword", () => {
    test("should update password successfully", async () => {
      const testData = createTestData();
      const newPassword = "newpassword1234";
      const { session } = await signUpAndVerify(testData);

      const result = await AuthenticationMethods.updatePassword(session, {
        currentPassword: testData.password,
        newPassword: newPassword,
        newPasswordConfirmation: newPassword,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Verify new password works
      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: newPassword,
      });

      expect(signInResult.user.id).toBe(session.userId);
    });

    test("should reject incorrect current password", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.updatePassword(session, {
          currentPassword: "wrongpassword",
          newPassword: "newpassword1234",
          newPasswordConfirmation: "newpassword1234",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should reject same password as current", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.updatePassword(session, {
          currentPassword: testData.password,
          newPassword: testData.password,
          newPasswordConfirmation: testData.password,
        })
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw UnauthorizedError with correct message for incorrect password", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      try {
        await AuthenticationMethods.updatePassword(session, {
          currentPassword: "wrongpassword",
          newPassword: "newpassword1234",
          newPasswordConfirmation: "newpassword1234",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect((error as UnauthorizedError).message).toBe("Current password is incorrect");
      }
    });
  });

  describe("invite backfill on verifyEmail", () => {
    // Helper to create a GM user, campaign, and email-only invite
    async function createEmailOnlyInvite(email: string) {
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const ctx = await getCtx();

      // Create GM user
      const gmUsers = await Users.create(db, {
        emailAddress: `gm-${uniqueId}@example.com`,
        password: "password1234",
      });
      const gmUser = gmUsers[0];
      await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: gmUser.id });
      const gmSession: Session = {
        id: `session-${uniqueId}`,
        userId: gmUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Create campaign with GM player
      const campaigns = await Campaigns.create(db, {
        name: `Campaign ${uniqueId}`,
        description: "test",
        rulesetId: ctx.rulesetId,
      });
      const campaign = campaigns[0];
      await Players.create(db, {
        userId: gmUser.id,
        campaignId: campaign.id,
        role: "Game Master",
      });

      // Create empty player slot
      const slots = await Players.create(db, {
        campaignId: campaign.id,
        role: "Player Character",
      });
      const emptySlot = slots[0];

      // Create email-only invite
      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, email
      );

      return { invite, emptySlot, campaign };
    }

    test("should backfill pending email-only invites when a new user verifies email", async () => {
      const email = `signup-backfill-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create email-only invite before user exists
      const { invite } = await createEmailOnlyInvite(email);
      expect(invite.userId).toBeNull();

      // Sign up with that email
      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: email,
        password: "password1234",
        passwordConfirmation: "password1234",
      });

      // Verify email — backfill should happen
      const verification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });
      await AuthenticationMethods.verifyEmail({
        emailAddress: email,
        code: verification!.code,
      });

      // Verify the invite now has the user's ID
      const updatedInvite = await Invites.findOne(db, { id: invite.id });
      expect(updatedInvite).toBeDefined();
      expect(updatedInvite!.userId).toBe(signUpResult.user.id);
    });

    test("should backfill multiple invites across campaigns on verifyEmail", async () => {
      const email = `multi-signup-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create two email-only invites in different campaigns
      const { invite: invite1 } = await createEmailOnlyInvite(email);
      const { invite: invite2 } = await createEmailOnlyInvite(email);

      expect(invite1.userId).toBeNull();
      expect(invite2.userId).toBeNull();

      // Sign up and verify
      const signUpResult = await AuthenticationMethods.signUp({
        emailAddress: email,
        password: "password1234",
        passwordConfirmation: "password1234",
      });

      const verification = await EmailVerifications.findOne(db, { userId: signUpResult.user.id });
      await AuthenticationMethods.verifyEmail({
        emailAddress: email,
        code: verification!.code,
      });

      // Both invites should be backfilled
      const updated1 = await Invites.findOne(db, { id: invite1.id });
      const updated2 = await Invites.findOne(db, { id: invite2.id });

      expect(updated1!.userId).toBe(signUpResult.user.id);
      expect(updated2!.userId).toBe(signUpResult.user.id);
    });
  });

  describe("forgotPassword", () => {
    test("should return success for existing user", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      const result = await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      expect(result.success).toBe(true);

      const user = await Users.findOne(db, { emailAddress: testData.emailAddress });
      const reset = await PasswordResets.findOne(db, { userId: user!.id });
      expect(reset).toBeDefined();
      expect(reset!.code).toHaveLength(8);
    });

    test("should silently succeed for non-existent email", async () => {
      const result = await AuthenticationMethods.forgotPassword({
        emailAddress: "nonexistent@example.com",
      });

      expect(result.success).toBe(true);
    });

    test("should respect 5-minute cooldown", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      const user = await Users.findOne(db, { emailAddress: testData.emailAddress });
      const firstReset = await PasswordResets.findOne(db, { userId: user!.id });

      // Second request within cooldown should silently succeed without creating a new reset
      await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      const secondReset = await PasswordResets.findOne(db, { userId: user!.id });
      expect(secondReset!.id).toBe(firstReset!.id);
    });
  });

  describe("resetPassword", () => {
    test("should reset password with valid code", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      const user = await Users.findOne(db, { emailAddress: testData.emailAddress });
      const reset = await PasswordResets.findOne(db, { userId: user!.id });

      const result = await AuthenticationMethods.resetPassword({
        emailAddress: testData.emailAddress,
        code: reset!.code,
        newPassword: "newpassword1234",
        newPasswordConfirmation: "newpassword1234",
      });

      expect(result.success).toBe(true);
    });

    test("should reject invalid code", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      await expect(
        AuthenticationMethods.resetPassword({
          emailAddress: testData.emailAddress,
          code: "000000",
          newPassword: "newpassword1234",
          newPasswordConfirmation: "newpassword1234",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should reject expired code", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      const user = await Users.findOne(db, { emailAddress: testData.emailAddress });
      const reset = await PasswordResets.findOne(db, { userId: user!.id });

      // Expire the reset
      await PasswordResets.update(db, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { id: reset!.id });

      await expect(
        AuthenticationMethods.resetPassword({
          emailAddress: testData.emailAddress,
          code: reset!.code,
          newPassword: "newpassword1234",
          newPasswordConfirmation: "newpassword1234",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should allow sign-in with new password after reset", async () => {
      const testData = createTestData();
      await signUpAndVerify(testData);

      await AuthenticationMethods.forgotPassword({
        emailAddress: testData.emailAddress,
      });

      const user = await Users.findOne(db, { emailAddress: testData.emailAddress });
      const reset = await PasswordResets.findOne(db, { userId: user!.id });

      await AuthenticationMethods.resetPassword({
        emailAddress: testData.emailAddress,
        code: reset!.code,
        newPassword: "newpassword1234",
        newPasswordConfirmation: "newpassword1234",
      });

      const signInResult = await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: "newpassword1234",
      });

      expect(signInResult.user.id).toBe(user!.id);
    });
  });

  describe("invite backfill on signIn", () => {
    test("should backfill pending email-only invites when user signs in", async () => {
      const testData = createTestData();
      const { user: signUpUser } = await signUpAndVerify(testData);
      const ctx = await getCtx();

      // Now create an email-only invite for this email
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const gmUsers = await Users.create(db, {
        emailAddress: `gm-signin-${uniqueId}@example.com`,
        password: "password1234",
      });
      const gmUser = gmUsers[0];

      const campaigns = await Campaigns.create(db, {
        name: `Campaign ${uniqueId}`,
        description: "test",
        rulesetId: ctx.rulesetId,
      });
      await Players.create(db, {
        userId: gmUser.id,
        campaignId: campaigns[0].id,
        role: "Game Master",
      });

      const slots = await Players.create(db, {
        campaignId: campaigns[0].id,
        role: "Player Character",
      });

      // Manually create an invite with userId = null (simulating email-only)
      const inviteRows = await Invites.create(db, {
        email: testData.emailAddress,
        playerId: slots[0].id,
      });
      const invite = inviteRows[0];
      expect(invite.userId).toBeNull();

      // Sign in — should backfill
      await AuthenticationMethods.signIn({
        emailAddress: testData.emailAddress,
        password: testData.password,
      });

      // Verify the invite now has the user's ID
      const updatedInvite = await Invites.findOne(db, { id: invite.id });
      expect(updatedInvite!.userId).toBe(signUpUser.id);
    });
  });

  describe("deleteAccount", () => {
    test("should archive user with correct password", async () => {
      const testData = createTestData();
      const { session, user } = await signUpAndVerify(testData);

      await AuthenticationMethods.deleteAccount(session, {
        password: testData.password,
      });

      const deletedUser = await Users.findOne(db, { id: user.id });
      expect(deletedUser).toBeUndefined();
    });

    test("should archive characters owned by user", async () => {
      const testData = createTestData();
      const { session, user } = await signUpAndVerify(testData);
      const ctx = await getCtx();

      const characters = await Characters.create(db, {
        name: "Test Character",
        userId: user.id,
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });
      const characterId = characters[0].id;

      await AuthenticationMethods.deleteAccount(session, {
        password: testData.password,
      });

      const character = await Characters.findOne(db, { id: characterId, userId: user.id });
      expect(character).toBeUndefined();
    });

    test("should orphan rulesets owned by user (userId becomes null)", async () => {
      const testData = createTestData();
      const { session, user } = await signUpAndVerify(testData);

      const rulesets = await Rulesets.create(db, {
        name: `Ruleset ${Math.random().toString(36).substr(2, 9)}`,
        description: "test",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
      });
      const rulesetId = rulesets[0].id;

      await AuthenticationMethods.deleteAccount(session, {
        password: testData.password,
      });

      const ruleset = await Rulesets.findOne(db, { id: rulesetId });
      expect(ruleset).toBeDefined();
      expect(ruleset!.userId).toBeNull();
    });

    test("should archive player records for user", async () => {
      const testData = createTestData();
      const { session, user } = await signUpAndVerify(testData);
      const ctx = await getCtx();

      // Create a campaign with the user as a player
      const campaigns = await Campaigns.create(db, {
        name: `Campaign ${Math.random().toString(36).substr(2, 9)}`,
        description: "test",
        rulesetId: ctx.rulesetId,
      });
      await Players.create(db, {
        userId: user.id,
        campaignId: campaigns[0].id,
        role: "Game Master",
      });

      const playersBefore = await Players.findMany(db, { userId: user.id });
      expect(playersBefore.length).toBeGreaterThan(0);

      await AuthenticationMethods.deleteAccount(session, {
        password: testData.password,
      });

      const playersAfter = await Players.findMany(db, { userId: user.id });
      expect(playersAfter.length).toBe(0);
    });

    test("should reject incorrect password", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await expect(
        AuthenticationMethods.deleteAccount(session, {
          password: "wrong-password",
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("should prevent sign-in after account deletion", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await AuthenticationMethods.deleteAccount(session, {
        password: testData.password,
      });

      await expect(
        AuthenticationMethods.signIn({
          emailAddress: testData.emailAddress,
          password: testData.password,
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    test("re-signing up with a deleted account's email is a clean conflict, not a constraint crash", async () => {
      const testData = createTestData();
      const { session } = await signUpAndVerify(testData);

      await AuthenticationMethods.deleteAccount(session, {
        password: testData.password,
      });

      // The archived row still holds the email on the users_email unique index,
      // so the pre-check must see it (Visibility.All) and 409 rather than slip
      // through and blow up on the insert.
      await expect(
        AuthenticationMethods.signUp({
          emailAddress: testData.emailAddress,
          password: testData.password,
          passwordConfirmation: testData.passwordConfirmation,
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});
