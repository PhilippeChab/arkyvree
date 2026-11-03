import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { activitiesInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterContributors,
  Contributors,
  Notifications,
  OauthAccounts,
  Players,
  toDeletedAddress,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { AuthenticationService, signInAsGoogleAccount } from "@/server/services/authentication/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { NotificationsService } from "@/server/services/notifications/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createCharacterAs } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, findVerificationCode } from "@/tests/support/users.ts";

const PASSWORD = "password1234";

/** A new account at `emailAddress`, signed up, verified and signed in as the app does. */
async function signUp(emailAddress = `freed-${uniqueId()}@example.com`) {
  await AuthenticationService.signUp(emailAddress, PASSWORD);
  const user = (await Users.findOne(db, { emailAddress }))!;
  const code = await findVerificationCode(user.id);
  const { session } = await AuthenticationService.verifyEmail(emailAddress, code);
  return { emailAddress, session, user };
}

describe("a deleted account", () => {
  test("keeps the placeholder alone: no address, username, pending address or password digest", async () => {
    const { emailAddress, session, user } = await signUp();
    const username = `gone-${uniqueId()}`;
    await AccountService.updateProfile(session, username, `pending-${uniqueId()}@example.com`);

    await AccountService.deleteAccount(session, PASSWORD);

    expect(await Users.findOne(db, { id: user.id }, Visibility.All)).toMatchObject({
      deletedAt: expect.any(String),
      emailAddress: toDeletedAddress(user.id),
      passwordDigest: null,
      pendingEmailAddress: null,
      username: null,
    });
    expect(await Users.findOne(db, { emailAddress }, Visibility.All)).toBeUndefined();
    expect(await Users.findOne(db, { username }, Visibility.All)).toBeUndefined();
    const [deletion] = await db
      .select()
      .from(activitiesInAccount)
      .where(and(eq(activitiesInAccount.userId, user.id), eq(activitiesInAccount.type, "deleteAccount")));
    expect(JSON.stringify(deletion)).not.toContain(emailAddress);
  });

  test("gives up its address and its username at once, which a new account takes", async () => {
    const old = await signUp();
    const username = `freed-${uniqueId()}`;
    await AccountService.updateProfile(old.session, username, undefined);

    await AccountService.deleteAccount(old.session, PASSWORD);

    const next = await signUp(old.emailAddress);
    expect(next.user.id).not.toBe(old.user.id);
    expect(await AccountService.updateProfile(next.session, username, undefined)).toMatchObject({ username });
    expect((await AuthenticationService.signIn(old.emailAddress, PASSWORD)).user.id).toBe(next.user.id);
  });

  test("gives the new account nothing of what it held at its address", async () => {
    const { user: gm, session: gmSession } = await createTestUser("gm");
    const joined = await createTestRuleset(gm.id, { private: true });
    const invited = await createTestRuleset(gm.id, { private: true });
    const character = await createCharacterAs(gmSession);
    const { campaign } = await createTestCampaign(gm.id);
    const old = await signUp();
    const { emailAddress } = old;
    const contribution = await ContributorsService.inviteContributor(gmSession, joined.id, emailAddress, "Admin");
    await ContributorsService.acceptInvite(old.session, contribution.id);
    const edit = await CharacterContributorsService.inviteContributor(gmSession, character.id, emailAddress);
    await CharacterContributorsService.acceptInvite(old.session, edit.id);
    const seat = await CampaignPlayersService.addPlayer(gmSession, campaign.id, "Game Master", emailAddress);
    await CampaignInvitesService.acceptInvite(old.session, seat.invite!.id);
    const invite = await ContributorsService.inviteContributor(gmSession, invited.id, emailAddress, "Admin");

    await AccountService.deleteAccount(old.session, PASSWORD);
    const next = await signUp(emailAddress);

    expect(await Contributors.findRole(db, { rulesetId: joined.id, userId: next.user.id })).toBeUndefined();
    expect(
      await CharacterContributors.findRole(db, { characterId: character.id, userId: next.user.id }),
    ).toBeUndefined();
    expect(await Players.findOne(db, { campaignId: campaign.id, userId: next.user.id })).toBeUndefined();
    expect(RulesetsService.getRuleset(next.session, joined.id)).rejects.toEqual(new NotFoundError("Ruleset not found"));
    expect(CampaignsService.getCampaign(next.session, campaign.id)).rejects.toEqual(
      new NotFoundError("Campaign not found"),
    );
    expect(ContributorsService.getInvite(next.session, invite.id)).rejects.toEqual(
      new NotFoundError("Contributor invite not found"),
    );
    expect(CampaignInvitesService.getInvite(next.session, seat.invite!.id)).rejects.toEqual(
      new NotFoundError("Invite not found"),
    );
    expect(await Contributors.findOne(db, { id: invite.id })).toMatchObject({ status: "Revoked", userId: old.user.id });
  });

  test("leaves an invite sent to its address since to whoever signs up with it", async () => {
    const { user: gm, session: gmSession } = await createTestUser("gm");
    const ruleset = await createTestRuleset(gm.id);
    const character = await createCharacterAs(gmSession);
    const { campaign } = await createTestCampaign(gm.id);
    const old = await signUp();
    const { emailAddress } = old;
    await AccountService.deleteAccount(old.session, PASSWORD);

    const contribution = await ContributorsService.inviteContributor(gmSession, ruleset.id, emailAddress, "Editor");
    const edit = await CharacterContributorsService.inviteContributor(gmSession, character.id, emailAddress);
    const { invite, player } = await CampaignPlayersService.addPlayer(
      gmSession,
      campaign.id,
      "Player Character",
      emailAddress,
    );
    expect([contribution.userId, edit.userId, invite?.userId]).toEqual([null, null, null]);

    const next = await signUp(emailAddress);
    await ContributorsService.acceptInvite(next.session, contribution.id);
    await CharacterContributorsService.acceptInvite(next.session, edit.id);
    await CampaignInvitesService.acceptInvite(next.session, invite!.id);

    expect(await Contributors.findRole(db, { rulesetId: ruleset.id, userId: next.user.id })).toBe("Editor");
    expect(await CharacterContributors.findRole(db, { characterId: character.id, userId: next.user.id })).toBe(
      "Editor",
    );
    expect((await Players.findOne(db, { campaignId: campaign.id, userId: next.user.id }))?.id).toBe(player.id);
  });

  test("leaves its Google account free to come back, as a new account", async () => {
    const email = `google-${uniqueId()}@example.com`;
    const sub = `google-${uniqueId()}`;
    const first = await signInAsGoogleAccount({ email, sub });

    await AccountService.deleteAccount(first.session, undefined);

    const again = await signInAsGoogleAccount({ email, sub });
    expect(again.user).toMatchObject({ emailAddress: email });
    expect(again.user.id).not.toBe(first.user.id);
    expect(await OauthAccounts.findOne(db, { provider: "google", providerAccountId: sub })).toMatchObject({
      userId: again.user.id,
    });
  });

  test("is deleted whatever its notifications hold: half an emoji, which jsonb refuses, stops nothing", async () => {
    const { session, user } = await signUp();
    const { user: owner } = await createTestUser("owner");
    await Notifications.create(db, {
      actorId: user.id,
      data: { actorName: "Gone", entityName: "Half \ud83d" },
      recipientId: owner.id,
      targetId: owner.id,
      targetType: "users",
      type: "updateEntity",
    });

    expect(await AccountService.deleteAccount(session, PASSWORD)).toEqual({ success: true });
    expect(await Users.findOne(db, { id: user.id })).toBeUndefined();
  });

  test("keeps the date its seat was joined on, which its Deleted Account row shows", async () => {
    const { session: gmSession, user: gm } = await createTestUser("gm");
    const { campaign } = await createTestCampaign(gm.id);
    const { emailAddress, session } = await signUp();
    const { invite, player } = await CampaignPlayersService.addPlayer(
      gmSession,
      campaign.id,
      "Player Character",
      emailAddress,
    );
    await CampaignInvitesService.acceptInvite(session, invite!.id);
    const joinedAt = async () => {
      const { items } = await CampaignPlayersService.getPlayers(gmSession, campaign.id, {}, { limit: 50, page: 1 });
      return items.find(({ id }) => id === player.id)?.joinedAt;
    };
    const joined = await joinedAt();

    await AccountService.deleteAccount(session, PASSWORD);

    expect(joined).toEqual(expect.any(String));
    expect(await joinedAt()).toBe(joined as string);
  });

  test("takes its name off the notifications it caused, which other people read as Someone's", async () => {
    const { user: gm, session: gmSession } = await createTestUser("gm");
    const { campaign } = await createTestCampaign(gm.id);
    const old = await signUp();
    await AccountService.updateProfile(old.session, `gone-${uniqueId()}`, undefined);
    const { invite } = await CampaignPlayersService.addPlayer(
      gmSession,
      campaign.id,
      "Player Character",
      old.emailAddress,
    );
    await CampaignInvitesService.acceptInvite(old.session, invite!.id);

    await AccountService.deleteAccount(old.session, PASSWORD);

    const { items } = await NotificationsService.getNotifications(gmSession, {}, { limit: 10, page: 1 });
    expect(items.map(({ type, data }) => formatNotificationMessage(type, data))).toEqual([
      "Someone accepted your campaign invite",
    ]);
  });
});
