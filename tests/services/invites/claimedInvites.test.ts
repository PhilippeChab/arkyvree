import { expect, test } from "bun:test";

import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError } from "@/server/errors/index.ts";
import { CharacterContributors, Contributors, OauthAccounts, Users } from "@/server/repositories/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";
import { LinkedAccountsService } from "@/server/services/authentication/linkedAccounts/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { withInviteRefusal } from "@/server/services/invites/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { createCharacterAs } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, findVerificationCode, makeSession } from "@/tests/support/users.ts";

test("an address invited before it had an account isn't invited again once it has one: its owner verifies it", async () => {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const character = await createCharacterAs(ownerSession);
  const email = `claimed-${uniqueId()}@example.com`;
  await ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Editor");
  await CharacterContributorsService.inviteContributor(ownerSession, character.id, email);
  const { user } = await AuthenticationService.signUp(email, "password1234");

  // The address's account, unverified: its invites are the address's still, which a second would duplicate
  const duplicate = new ConflictError("This email already has a pending invite");
  expect(ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Editor")).rejects.toEqual(duplicate);
  expect(CharacterContributorsService.inviteContributor(ownerSession, character.id, email)).rejects.toEqual(duplicate);
  await AuthenticationService.verifyEmail(email, await findVerificationCode(user.id));
  expect((await Contributors.findOne(db, { rulesetId: ruleset.id, userId: user.id, status: "Pending" }))?.email).toBe(
    email,
  );
  expect(
    (await CharacterContributors.findOne(db, { characterId: character.id, userId: user.id, status: "Pending" }))?.email,
  ).toBe(email);
});

test("an address's invite isn't given to a user who already has one there under another: they sign in", async () => {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const character = await createCharacterAs(ownerSession);
  const { user } = await createTestUser("contributor");
  await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
  await ContributorsService.inviteContributor(ownerSession, ruleset.id, user.emailAddress, "Editor");
  await CharacterContributorsService.inviteContributor(ownerSession, character.id, user.emailAddress);
  const email = `claimed-${uniqueId()}@example.com`;
  await ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Viewer");
  await CharacterContributorsService.inviteContributor(ownerSession, character.id, email);

  // Their address becomes the invited one: their own invites stay theirs, the address's left unclaimed
  await Users.update(db, { emailAddress: email }, { id: user.id });
  expect((await AuthenticationService.signIn(email, "password1234")).user.id).toBe(user.id);
  expect(
    await Contributors.findOne(db, { rulesetId: ruleset.id, email, status: "Pending", userId: null }),
  ).toBeDefined();
  expect(
    await CharacterContributors.findOne(db, { characterId: character.id, email, status: "Pending", userId: null }),
  ).toBeDefined();
});

test("an address another user's invite still names is invited for its new owner", async () => {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const { user: former } = await createTestUser("former");
  const email = former.emailAddress;
  await ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Editor");

  // The address moves to another account: the former owner's invite is theirs still, the new owner's is new
  await Users.update(db, { emailAddress: `moved-${uniqueId()}@example.com` }, { id: former.id });
  const { user: current } = await createTestUser("current");
  await Users.update(db, { emailAddress: email }, { id: current.id });
  const invite = await ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Viewer");
  expect(invite.userId).toBe(current.id);
});

test("unlinking a Google account unlinks the session's own, never another user's", async () => {
  const { user: linked } = await createTestUser("linked");
  const { user: unlinked } = await createTestUser("unlinked");
  const sub = `google-${uniqueId()}`;
  await OauthAccounts.create(db, { userId: linked.id, provider: "google", providerAccountId: sub });

  expect(LinkedAccountsService.unlinkOauthAccount(makeSession(unlinked.id), "google")).rejects.toEqual(
    new BadRequestError("OAuth provider not linked"),
  );
  expect((await OauthAccounts.findOne(db, { provider: "google", providerAccountId: sub }))?.userId).toBe(linked.id);
});

test("an invite whose user a sign-in's claim gave another invite meanwhile is refused as a conflict, not a 500", async () => {
  const { user: owner } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const { user } = await createTestUser("invitee");
  const invite = { rulesetId: ruleset.id, email: user.emailAddress, invitedBy: owner.id, userId: user.id };
  // The claim's row, committed between the invite's checks and its insert: the insert meets the user's index, in a
  // savepoint of its own, so the test's transaction goes on
  await Contributors.create(db, { ...invite, role: "Editor" });
  const refused = withTransaction((tx) =>
    withInviteRefusal(() => Contributors.create(tx, { ...invite, role: "Viewer" })),
  );
  expect(refused).rejects.toMatchObject({ code: 409, message: "User already has a pending invite" });
  expect(await Contributors.findOne(db, { rulesetId: ruleset.id, userId: user.id, status: "Pending" })).toBeDefined();
});
