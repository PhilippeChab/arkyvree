import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { activitiesInAccount, passwordResetLinksInAccount, sessionsInAccount } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import { hashLinkToken } from "@/server/linkTokens.ts";
import { PasswordResetLinks, PasswordResets, Sessions, Users } from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { DEACTIVATED_MESSAGE } from "@/server/services/authentication/accounts.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";
import { InstanceService } from "@/server/services/instance/index.ts";
import { PASSWORD_RESET_LINK_MESSAGES } from "@/shared/passwordResetLinks.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

/** The seeded admin's session (LocalUser, the dev and test instances' admin). */
const admin = makeSession(SEED_USER_ID);

const NEW_PASSWORD = "brand-new-password-1";

const NOT_ADMIN = new ForbiddenError("Only an admin of this Arkyvree can do this");

/** A new verified account, signed in with a stored session, and a password reset link an admin made for it. */
async function createAccountWithLink() {
  const { user } = await createTestUser("locked-out");
  await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
  const [session] = await Sessions.create(db, { userId: user.id });
  const link = await InstanceService.createPasswordResetLink(admin, user.id);
  return { link, session, user };
}

/** What a link reads as now. */
async function readState(token: string) {
  return (await AuthenticationService.getPasswordResetLinkState(token)).state;
}

describe("an admin's password reset links", () => {
  test("an admin makes one for an hour, its token answered once and kept as its digest alone", async () => {
    const { link, user } = await createAccountWithLink();
    expect(link.token).toStartWith("arkr_");
    const minutes = (new Date(link.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(60);

    const [stored] = await db
      .select()
      .from(passwordResetLinksInAccount)
      .where(eq(passwordResetLinksInAccount.userId, user.id));
    expect(stored?.digest).toBe(hashLinkToken(link.token));
    expect(JSON.stringify(stored)).not.toContain(link.token);
    expect(await readState(link.token)).toBe("Valid");
  });

  test("anyone else is refused, an unknown account alike; a deactivated account gets none", async () => {
    const { user, session } = await createTestUser("member");
    expect(InstanceService.createPasswordResetLink(session, SEED_USER_ID)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.createPasswordResetLink(session, NIL_UUID)).rejects.toEqual(NOT_ADMIN);

    await InstanceService.setAccountDeactivated(admin, user.id, true);
    expect(InstanceService.createPasswordResetLink(admin, user.id)).rejects.toBeInstanceOf(ConflictError);
  });

  test("a new link ends the account's earlier one", async () => {
    const { link, user } = await createAccountWithLink();
    const next = await InstanceService.createPasswordResetLink(admin, user.id);
    expect(await readState(link.token)).toBe("Expired");
    expect(await readState(next.token)).toBe("Valid");
  });

  test("resets the password once, signing the account out everywhere", async () => {
    const { link, session, user } = await createAccountWithLink();
    expect(await AuthenticationService.resetPasswordWithLink(link.token, NEW_PASSWORD)).toEqual({ success: true });

    const signedIn = await AuthenticationService.signIn(user.emailAddress, NEW_PASSWORD);
    expect(signedIn.user.id).toBe(user.id);
    const [old] = await db.select().from(sessionsInAccount).where(eq(sessionsInAccount.id, session.id));
    expect(old?.deletedAt).not.toBeNull();

    expect(await readState(link.token)).toBe("Used");
    expect(AuthenticationService.resetPasswordWithLink(link.token, "another-password-2")).rejects.toEqual(
      new ForbiddenError(PASSWORD_RESET_LINK_MESSAGES.Used),
    );
  });

  test("refuses an expired link, an unknown one, and a deactivated account's", async () => {
    const { link } = await createAccountWithLink();
    await db
      .update(passwordResetLinksInAccount)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(passwordResetLinksInAccount.digest, hashLinkToken(link.token)));
    expect(await readState(link.token)).toBe("Expired");
    expect(AuthenticationService.resetPasswordWithLink(link.token, NEW_PASSWORD)).rejects.toEqual(
      new ForbiddenError(PASSWORD_RESET_LINK_MESSAGES.Expired),
    );

    expect(await readState("arkr_nothing")).toBe("Unknown");
    expect(AuthenticationService.resetPasswordWithLink("arkr_nothing", NEW_PASSWORD)).rejects.toEqual(
      new ForbiddenError(PASSWORD_RESET_LINK_MESSAGES.Unknown),
    );

    // Deactivated after its link was made: the link stops working, and stays stopped once it's reactivated
    const deactivated = await createAccountWithLink();
    await InstanceService.setAccountDeactivated(admin, deactivated.user.id, true);
    await InstanceService.setAccountDeactivated(admin, deactivated.user.id, false);
    expect(await readState(deactivated.link.token)).toBe("Expired");
  });

  test("refuses a deactivated account's link that still reads as valid", async () => {
    const { link, user } = await createAccountWithLink();
    // Deactivated behind the service's back: the reset still refuses it
    await Users.update(db, { deactivatedAt: new Date().toISOString() }, { id: user.id });
    expect(AuthenticationService.resetPasswordWithLink(link.token, NEW_PASSWORD)).rejects.toEqual(
      new ForbiddenError(DEACTIVATED_MESSAGE),
    );
  });

  test("a reset by an emailed code ends the account's links too", async () => {
    const { link, user } = await createAccountWithLink();
    await AuthenticationService.forgotPassword(user.emailAddress);
    const code = (await PasswordResets.findOne(db, { userId: user.id }))!.code;
    await AuthenticationService.resetPassword(user.emailAddress, code, NEW_PASSWORD);
    expect(await readState(link.token)).toBe("Expired");
  });

  test("its activity names the admin who made the link it came through", async () => {
    const { link, user } = await createAccountWithLink();
    await AuthenticationService.resetPasswordWithLink(link.token, NEW_PASSWORD);
    const [activity] = await db
      .select()
      .from(activitiesInAccount)
      .where(and(eq(activitiesInAccount.userId, user.id), eq(activitiesInAccount.type, "resetPassword")));
    expect(activity?.data).toEqual({ resetLinkCreatedBy: SEED_USER_ID });
  });

  test("a password changed or set while signed in ends the account's links", async () => {
    const changed = await createAccountWithLink();
    await AccountService.updatePassword(changed.session, "password1234", NEW_PASSWORD);
    expect(await readState(changed.link.token)).toBe("Expired");

    // A Google account's first password, set from its settings
    const { user, session } = await createTestUser("google-only");
    await Users.update(db, { emailVerifiedAt: new Date().toISOString(), passwordDigest: null }, { id: user.id });
    const link = await InstanceService.createPasswordResetLink(admin, user.id);
    await AccountService.setPassword(session, NEW_PASSWORD);
    expect(await readState(link.token)).toBe("Expired");
  });

  test("an admin's links stop working once they lose their rights, and any admin makes one for another admin", async () => {
    // Another admin, whose own account an admin's link may reset
    const { user: other, session: otherSession } = await createTestUser("other-admin");
    await Users.update(db, { emailVerifiedAt: new Date().toISOString(), isAdmin: true }, { id: other.id });
    expect((await InstanceService.createPasswordResetLink(admin, other.id)).token).toStartWith("arkr_");

    for (const loseRights of [
      () => InstanceService.setAccountAdmin(admin, other.id, false),
      () => InstanceService.setAccountDeactivated(admin, other.id, true),
    ]) {
      await Users.update(db, { isAdmin: true, deactivatedAt: null }, { id: other.id });
      const { user: target } = await createTestUser("target");
      const link = await InstanceService.createPasswordResetLink(otherSession, target.id);
      await loseRights();
      expect(await readState(link.token)).toBe("Expired");
    }

    // Their own account deleted, another admin left: the links they made stop working with it
    await Users.update(db, { isAdmin: true, deactivatedAt: null }, { id: other.id });
    const { user: target } = await createTestUser("target");
    const link = await InstanceService.createPasswordResetLink(otherSession, target.id);
    expect(await AccountService.deleteAccount(otherSession, "password1234")).toEqual({ success: true });
    expect(await readState(link.token)).toBe("Expired");
  });

  test("the cleanup deletes links once they've expired", async () => {
    const { link } = await createAccountWithLink();
    await PasswordResetLinks.delete(db, { expiresBefore: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
    expect(await PasswordResetLinks.findOne(db, { digest: hashLinkToken(link.token) })).toBeUndefined();
  });
});
