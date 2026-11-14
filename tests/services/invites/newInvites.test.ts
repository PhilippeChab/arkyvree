import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { UnprocessableEntityError } from "@/server/errors/index.ts";
import { InstanceSettings, Users } from "@/server/repositories/index.ts";
import { CLOSED_INVITE_MESSAGE } from "@/server/services/authentication/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createCharacterAs } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** An owner's campaign, ruleset and character, each of which invites an address, and a way to invite it to each. */
async function createInviter() {
  const { user: owner, session } = await createTestUser("owner");
  const { campaign } = await createTestCampaign(owner.id);
  const ruleset = await createTestRuleset(owner.id);
  const character = await createCharacterAs(session);
  return {
    toCampaign: (email: string) => CampaignPlayersService.addPlayer(session, campaign.id, "Player Character", email),
    toCharacter: (email: string) => CharacterContributorsService.inviteContributor(session, character.id, email),
    toRuleset: (email: string) => ContributorsService.inviteContributor(session, ruleset.id, email, "Editor"),
  };
}

test("an instance closed to new accounts refuses an invite to an address no account holds, whatever it's to", async () => {
  const invite = await createInviter();
  await InstanceSettings.update(db, { signUpPolicy: "Closed" });
  const refusal = new UnprocessableEntityError(CLOSED_INVITE_MESSAGE);
  expect(invite.toCampaign(`nobody-${uniqueId()}@example.com`)).rejects.toEqual(refusal);
  expect(invite.toRuleset(`nobody-${uniqueId()}@example.com`)).rejects.toEqual(refusal);
  expect(invite.toCharacter(`nobody-${uniqueId()}@example.com`)).rejects.toEqual(refusal);
});

test("an instance closed to new accounts invites an address an account holds, as ever", async () => {
  const invite = await createInviter();
  const { user: invitee } = await createTestUser("invitee");
  await InstanceSettings.update(db, { signUpPolicy: "Closed" });
  expect((await invite.toCampaign(invitee.emailAddress)).invite?.userId).toBe(invitee.id);
  expect((await invite.toRuleset(invitee.emailAddress)).userId).toBe(invitee.id);
  expect((await invite.toCharacter(invitee.emailAddress)).userId).toBe(invitee.id);
});

test("an instance that takes invites, or has no admin yet, invites any address", async () => {
  const invite = await createInviter();
  await InstanceSettings.update(db, { signUpPolicy: "Invite Only" });
  expect((await invite.toRuleset(`someone-${uniqueId()}@example.com`)).userId).toBeNull();

  // Closed, but without an admin: its next account becomes its admin, so an address may still sign up
  await InstanceSettings.update(db, { signUpPolicy: "Closed" });
  await Users.update(db, { isAdmin: false }, { id: SEED_USER_ID });
  expect((await invite.toCharacter(`someone-${uniqueId()}@example.com`)).userId).toBeNull();
});
