import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { inviteLinksInAccount } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { hashInviteLinkToken } from "@/server/inviteLinkTokens.ts";
import { InstanceSettings, InviteLinks, Players, Users } from "@/server/repositories/index.ts";
import { AuthenticationService, signInAsGoogleAccount } from "@/server/services/authentication/index.ts";
import { CLOSED_MESSAGE, INVITE_ONLY_MESSAGE } from "@/server/services/authentication/signUps.ts";
import { InstanceService } from "@/server/services/instance/index.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";
import { INVITE_LINK_MESSAGES } from "@/shared/inviteLinks.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

/** The seeded admin's session (LocalUser, the dev and test instances' admin). */
const admin = makeSession(SEED_USER_ID);

const NOT_ADMIN = new ForbiddenError("Only an admin of this Arkyvree can do this");

/** A new address and a password, which no account holds. */
function credentials() {
  const id = uniqueId();
  return { emailAddress: `invited-${id}@example.com`, password: `password-${id}` };
}

/** A Google account no account is linked to yet, as its ID token names it. */
function googleAccount() {
  const id = uniqueId();
  return { email: `google-invited-${id}@example.com`, sub: `google-invited-${id}` };
}

/** A new link's token, in each state a link reads as: one that lets anyone sign up, expired, or revoked. */
async function createLink(state: "Expired" | "Revoked" | "Valid" = "Valid") {
  const link = await InstanceService.createInviteLink(admin, 7);
  if (state === "Expired") {
    await db
      .update(inviteLinksInAccount)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(inviteLinksInAccount.id, link.id));
  }
  if (state === "Revoked") await InstanceService.revokeInviteLink(admin, link.id);
  return link;
}

/** Sets who may make an account on the instance, within the test's transaction. */
async function setPolicy(signUpPolicy: SignUpPolicy) {
  await InstanceSettings.update(db, { signUpPolicy });
}

/** Makes an account with an invite link's token, by email or by a Google account's first sign-in. */
async function signUpWith(path: "email" | "google", token: string) {
  if (path === "google") return (await signInAsGoogleAccount(googleAccount(), token)).user.id;
  const account = credentials();
  return (await AuthenticationService.signUp(account.emailAddress, account.password, token)).user.id;
}

describe("an admin's invite links", () => {
  test("an admin makes one, its token answered once and kept as its digest alone, and lists it", async () => {
    const link = await InstanceService.createInviteLink(admin, 7);
    expect(link.token).toStartWith("arki_");
    expect(link.state).toBe("Valid");
    const days = (new Date(link.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    const [stored] = await db.select().from(inviteLinksInAccount);
    expect(stored?.digest).toBe(hashInviteLinkToken(link.token));
    expect(JSON.stringify(stored)).not.toContain(link.token);

    const { items } = await InstanceService.getInviteLinks(admin, { limit: 10, page: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ accounts: 0, createdBy: SEED_USER_ID, id: link.id, state: "Valid" });
    expect(items[0]).not.toHaveProperty("token");
    expect(items[0]).not.toHaveProperty("digest");
  });

  test("a revoked link stays listed, marked so; revoking it again changes nothing", async () => {
    const link = await InstanceService.createInviteLink(admin, 1);
    const revoked = await InstanceService.revokeInviteLink(admin, link.id);
    expect(revoked.state).toBe("Revoked");
    expect((await InstanceService.revokeInviteLink(admin, link.id)).revokedAt).toBe(revoked.revokedAt);
    const { items } = await InstanceService.getInviteLinks(admin, { limit: 10, page: 1 });
    expect(items.map((item) => item.state)).toEqual(["Revoked"]);
  });

  test("a closed instance makes none: nobody could sign up with it", async () => {
    await setPolicy("Closed");
    expect(InstanceService.createInviteLink(admin, 7)).rejects.toBeInstanceOf(ConflictError);
  });

  test("an unknown link isn't found", async () => {
    expect(InstanceService.revokeInviteLink(admin, NIL_UUID)).rejects.toEqual(
      new NotFoundError("Invite link not found"),
    );
  });

  test("anyone else is refused, an unknown link's id too, before it's looked up", async () => {
    const link = await createLink();
    const { session } = await createTestUser("member");
    expect(InstanceService.createInviteLink(session, 7)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.getInviteLinks(session, { limit: 10, page: 1 })).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.revokeInviteLink(session, link.id)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.revokeInviteLink(session, NIL_UUID)).rejects.toEqual(NOT_ADMIN);
  });
});

describe("signing up with an invite link", () => {
  for (const path of ["email", "google"] as const) {
    describe(`by ${path}`, () => {
      test("an instance that takes invites alone takes anyone with a link that works, and counts them", async () => {
        await setPolicy("Invite Only");
        const link = await createLink();
        const userId = await signUpWith(path, link.token);
        expect((await Users.findOne(db, { id: userId }))?.inviteLinkId).toBe(link.id);
        const { items } = await InstanceService.getInviteLinks(admin, { limit: 10, page: 1 });
        expect(items[0]?.accounts).toBe(1);
      });

      for (const state of ["Expired", "Revoked"] as const) {
        test(`an instance that takes invites alone refuses a link that's ${state.toLowerCase()}`, async () => {
          await setPolicy("Invite Only");
          const link = await createLink(state);
          expect(signUpWith(path, link.token)).rejects.toEqual(new ForbiddenError(INVITE_LINK_MESSAGES[state]));
        });
      }

      test("an instance that takes invites alone refuses a token that names no link", async () => {
        await setPolicy("Invite Only");
        expect(signUpWith(path, `arki_${uniqueId()}`)).rejects.toEqual(
          new ForbiddenError(INVITE_LINK_MESSAGES.Unknown),
        );
      });

      test("an open instance takes anyone, whatever their link: a link that works is counted", async () => {
        await setPolicy("Open");
        const valid = await createLink();
        const validUser = await signUpWith(path, valid.token);
        expect((await Users.findOne(db, { id: validUser }))?.inviteLinkId).toBe(valid.id);
        const revoked = await createLink("Revoked");
        const revokedUser = await signUpWith(path, revoked.token);
        expect((await Users.findOne(db, { id: revokedUser }))?.inviteLinkId).toBeNull();
      });

      test("a closed instance refuses anyone, a link that works too", async () => {
        const link = await createLink();
        await setPolicy("Closed");
        expect(signUpWith(path, link.token)).rejects.toEqual(new ForbiddenError(CLOSED_MESSAGE));
      });
    });
  }

  test("an address invited to a campaign signs up whatever the link it opened reads as", async () => {
    await setPolicy("Invite Only");
    const link = await createLink("Expired");
    const account = credentials();
    const { user: gm, session } = await createTestUser("gm");
    const { campaign } = await createTestCampaign(gm.id);
    const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
    await inviteToSlot(session, slot, account.emailAddress);
    const { user } = await AuthenticationService.signUp(account.emailAddress, account.password, link.token);
    expect(user.emailAddress).toBe(account.emailAddress);
  });

  test("without a link or an invite, an instance that takes invites alone refuses as before", async () => {
    await setPolicy("Invite Only");
    const account = credentials();
    expect(AuthenticationService.signUp(account.emailAddress, account.password)).rejects.toEqual(
      new ForbiddenError(INVITE_ONLY_MESSAGE),
    );
  });
});

describe("what an invite link's token reads as, to whoever opens it", () => {
  test("whether it works, or why not, and nothing else of its link", async () => {
    const valid = await createLink();
    expect(await AuthenticationService.getInviteLinkState(valid.token)).toEqual({ state: "Valid" });
    const revoked = await createLink("Revoked");
    expect(await AuthenticationService.getInviteLinkState(revoked.token)).toEqual({ state: "Revoked" });
    expect(await AuthenticationService.getInviteLinkState(`arki_${uniqueId()}`)).toEqual({ state: "Unknown" });
    await db.update(inviteLinksInAccount).set({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await AuthenticationService.getInviteLinkState(valid.token)).toEqual({ state: "Expired" });
  });

  test("the database keeps no token: a link is found by its digest alone", async () => {
    const link = await createLink();
    expect(await InviteLinks.findOne(db, { digest: link.token })).toBeUndefined();
    expect((await InviteLinks.findOne(db, { digest: hashInviteLinkToken(link.token) }))?.id).toBe(link.id);
  });
});
