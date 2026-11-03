import { describe, expect, test } from "bun:test";

import { formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { db } from "@/server/database/index.ts";
import {
  Attachments,
  Campaigns,
  CharacterContributors,
  Characters,
  PlayerCharacters,
  Players,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { NotificationsService } from "@/server/services/notifications/index.ts";
import { ATTACHMENT_SLOTS } from "@/shared/attachments.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestAttachment } from "@/tests/support/files.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A seated account: its user, its session and its seat. */
type Seated = Awaited<ReturnType<typeof seatPlayer>>;

const FIRST_PAGE = { limit: 50, page: 1 };

const { name: PORTRAIT, recordType: PORTRAIT_RECORD } = ATTACHMENT_SLOTS.portrait;

/** A familiar bonded to `master`, a character of `userId`'s. */
function bondCreature(userId: string, masterId: string) {
  return createTestCharacter(userId, { kind: "familiar", parentCharacterId: masterId });
}

function deleteAccount({ session }: Pick<Seated, "session">) {
  return AccountService.deleteAccount(session, "password1234");
}

/** A campaign with its Game Master, whose seat `gm` is, and a player. */
async function createParty() {
  const { user, session } = await createTestUser("gm");
  const { campaign, player } = await createTestCampaign(user.id);
  return { campaign, gm: { player, session, user }, player: await seatPlayer(campaign.id) };
}

/** The account's characters whose rows are gone: all of `ids`, archived or not. */
async function expectGone(...ids: string[]) {
  expect(await Characters.findMany(db, { ids }, Visibility.All)).toEqual([]);
}

/** A character of a seated account's, linked to its seat as `visibility`. */
async function linkCharacter(
  { player, user }: Seated,
  visibility: "Private" | "Public" | "Partial" = "Private",
  values: Parameters<typeof createTestCharacter>[1] = {},
) {
  const character = await createTestCharacter(user.id, values);
  await PlayerCharacters.create(db, { characterId: character.id, playerId: player.id, visibility });
  return character;
}

/** The messages `session`'s user reads in their notifications. */
async function messagesOf({ session }: Pick<Seated, "session">) {
  const { items } = await NotificationsService.getNotifications(session, {}, FIRST_PAGE);
  return items.map(({ type, data }) => formatNotificationMessage(type, data));
}

/** A new account's seat in the campaign. */
async function seatPlayer(campaignId: string, role: CampaignRole = "Player Character") {
  const { user, session } = await createTestUser("seated");
  const [player] = await Players.create(db, { campaignId, role, userId: user.id });
  return { player, session, user };
}

describe("a deleted account's character in a campaign", () => {
  test("goes to the Game Master, live, as it was, on their seat, and shows in the campaign", async () => {
    const { campaign, gm, player } = await createParty();
    const notes = { description: "Scarred", notes: "Owes the guild", privateNotes: "Is the guild" };
    const character = await linkCharacter(player, "Partial", notes);
    const familiar = await bondCreature(player.user.id, character.id);
    await createTestAttachment("portrait", character.id);
    const { user: contributor } = await createTestUser("contributor");
    await addCharacterContributor(character.id, contributor, player.user.id);
    const witness = await seatPlayer(campaign.id);

    await deleteAccount(player);

    const owned = { deletedAt: null, userId: gm.user.id };
    expect(await Characters.findOne(db, { id: character.id })).toMatchObject({ ...owned, ...notes });
    expect(await Characters.findOne(db, { id: familiar.id })).toMatchObject(owned);
    expect(await PlayerCharacters.findOne(db, { characterId: character.id })).toMatchObject({
      playerId: gm.player.id,
      visibility: "Partial",
    });
    expect(
      await Attachments.findOneWithBlob(db, { name: PORTRAIT, recordId: character.id, recordType: PORTRAIT_RECORD }),
    ).toBeDefined();
    expect(await CharacterContributors.findRole(db, { characterId: character.id, userId: contributor.id })).toBe(
      "Editor",
    );

    const { items } = await CampaignCharactersService.getCharacters(gm.session, campaign.id, {}, FIRST_PAGE);
    expect(items).toMatchObject([{ id: character.id, isOwn: true, canSetVisibility: true, visibility: "Partial" }]);
    const seenByOthers = await CampaignCharactersService.getCharacters(witness.session, campaign.id, {}, FIRST_PAGE);
    expect(seenByOthers.items.map(({ id }) => id)).toEqual([character.id]);
    expect(await CampaignCharactersService.getCharacter(gm.session, campaign.id, character.id)).toMatchObject({
      id: character.id,
      isOwner: true,
      permissions: { canEdit: true },
    });
    expect(await CampaignCharactersService.getCharacter(witness.session, campaign.id, character.id)).toMatchObject({
      isPartial: true,
      permissions: { canEdit: false },
    });
  });

  test("is its new owner's to edit, and no longer names the old account", async () => {
    const { campaign, gm, player } = await createParty();
    const character = await linkCharacter(player);
    const username = `gone-${uniqueId()}`;
    await Users.update(db, { username }, { id: player.user.id });

    await deleteAccount(player);

    const edited = await CharactersService.updateCharacter(gm.session, character.id, { notes: "Mine now" });
    expect(edited).toMatchObject({ id: character.id });
    const { owner } = await CharacterContributorsService.getContributors(gm.session, character.id, {}, FIRST_PAGE);
    expect(owner).toMatchObject({ id: gm.user.id });
    const shown = JSON.stringify([
      owner,
      await CharactersService.getCharacter(gm.session, character.id),
      await CampaignCharactersService.getCharacter(gm.session, campaign.id, character.id),
    ]);
    expect(shown).not.toContain(player.user.emailAddress);
    expect(shown).not.toContain(username);
    expect(shown).not.toContain(player.user.id);
  });

  test("ends the contribution of the Game Master it goes to, active or pending, and no one else's", async () => {
    const { gm, player } = await createParty();
    const contributed = await linkCharacter(player);
    await addCharacterContributor(contributed.id, gm.user, player.user.id);
    const invited = await linkCharacter(player);
    await CharacterContributorsService.inviteContributor(player.session, invited.id, gm.user.emailAddress);
    const { user: other } = await createTestUser("other");
    await addCharacterContributor(contributed.id, other, player.user.id);

    await deleteAccount(player);

    for (const { id: characterId } of [contributed, invited]) {
      expect(await Characters.findOne(db, { id: characterId })).toMatchObject({ userId: gm.user.id });
      expect(await CharacterContributors.findRole(db, { characterId, userId: gm.user.id })).toBeUndefined();
      const { items } = await CharacterContributorsService.getContributors(gm.session, characterId, {}, FIRST_PAGE);
      expect(items.map(({ userId }) => userId)).not.toContain(gm.user.id);
      for (const status of ["Active", "Pending"] as const)
        expect(await CharacterContributors.findOne(db, { characterId, status, userId: gm.user.id })).toBeUndefined();
    }
    expect(await CharacterContributors.findRole(db, { characterId: contributed.id, userId: other.id })).toBe("Editor");
  });

  test("goes to the longest-seated of its Game Masters, never the deleted account", async () => {
    const { campaign, gm } = await createParty();
    const longest = await seatPlayer(campaign.id, "Game Master");
    await Players.update(db, { createdAt: "2021-01-01T00:00:00Z" }, { id: longest.player.id });
    const deleted = await seatPlayer(campaign.id, "Game Master");
    await Players.update(db, { createdAt: "2020-01-01T00:00:00Z" }, { id: deleted.player.id });
    const character = await linkCharacter(deleted);

    await deleteAccount(deleted);

    expect(await Characters.findOne(db, { id: character.id })).toMatchObject({ userId: longest.user.id });
    expect((await Players.findOne(db, { id: gm.player.id }))?.role).toBe("Game Master");
  });
});

describe("a deleted account's character in a campaign, handed on", () => {
  test("ends its share link, which was the deleted account's to give", async () => {
    const { gm, player } = await createParty();
    const character = await linkCharacter(player);
    await Characters.update(db, { shareToken: `share-${uniqueId()}` }, { id: character.id });

    await deleteAccount(player);

    expect((await Characters.findOne(db, { id: character.id }))?.shareToken).toBeNull();
    expect((await Characters.findOne(db, { id: character.id }))?.userId).toBe(gm.user.id);
  });

  test("ends an invite at its new owner's address that no sign-in claimed, and no one else's", async () => {
    const { gm, player } = await createParty();
    const character = await linkCharacter(player);
    const invite = (email: string) =>
      CharacterContributors.create(db, { characterId: character.id, email, invitedBy: player.user.id });
    const [theirs] = await invite(gm.user.emailAddress);
    const [another] = await invite(`another-${uniqueId()}@example.com`);

    await deleteAccount(player);

    expect((await CharacterContributors.findOne(db, { id: theirs.id }))?.status).toBe("Revoked");
    expect((await CharacterContributors.findOne(db, { id: another.id }))?.status).toBe("Pending");
  });
});

describe("a deleted account's other characters", () => {
  test("are gone, with their bonded creatures: in no campaign, in an archived one, and one it archived", async () => {
    const { campaign, player } = await createParty();
    const { user: otherMaster } = await createTestUser("gm");
    const { campaign: archived } = await createTestCampaign(otherMaster.id);
    const [seat] = await Players.create(db, {
      campaignId: archived.id,
      role: "Player Character",
      userId: player.user.id,
    });

    const free = await createTestCharacter(player.user.id);
    const freeFamiliar = await bondCreature(player.user.id, free.id);
    await createTestAttachment("portrait", free.id);
    const benched = await linkCharacter(player);
    const benchedFamiliar = await bondCreature(player.user.id, benched.id);
    await CharactersService.archiveCharacter(player.session, benched.id);
    const shelved = await linkCharacter({ ...player, player: seat });
    const shelvedFamiliar = await bondCreature(player.user.id, shelved.id);
    await Campaigns.archive(db, { id: archived.id });

    await deleteAccount(player);

    await expectGone(free.id, freeFamiliar.id, benched.id, benchedFamiliar.id, shelved.id, shelvedFamiliar.id);
    expect(
      await Attachments.findOneWithBlob(db, { name: PORTRAIT, recordId: free.id, recordType: PORTRAIT_RECORD }),
    ).toBeUndefined();
    expect(await PlayerCharacters.findOne(db, { characterId: shelved.id })).toBeUndefined();
    expect(await Campaigns.findOne(db, { id: campaign.id })).toBeDefined();
  });
});

describe("a campaign that loses its last Game Master", () => {
  test("passes to the longest-seated player by the date they joined, not the slot's age, who's told", async () => {
    const { user: gmUser, session: gmSession } = await createTestUser("gm");
    const { campaign, player: gmPlayer } = await createTestCampaign(gmUser.id);
    const gm = { player: gmPlayer, session: gmSession, user: gmUser };

    // The oldest slot, which its player took just now
    const { player: oldSlot } = await CampaignPlayersService.addPlayer(gmSession, campaign.id, "Player Character");
    await Players.update(db, { createdAt: "2020-01-01T00:00:00Z" }, { id: oldSlot.id });
    const lateJoiner = await createTestUser("late");
    const invite = await inviteToSlot(gmSession, oldSlot, lateJoiner.user.emailAddress);
    await CampaignInvitesService.acceptInvite(lateJoiner.session, invite.id);
    // A younger slot, taken long ago
    const heir = await seatPlayer(campaign.id);
    await Players.update(db, { createdAt: "2021-01-01T00:00:00Z" }, { id: heir.player.id });
    const heirsCharacter = await linkCharacter(heir, "Public");
    const gmsCharacter = await linkCharacter(gm, "Private");

    await deleteAccount(gm);

    expect(await Players.findOne(db, { id: heir.player.id })).toMatchObject({ role: "Game Master" });
    expect(await Players.findOne(db, { id: oldSlot.id })).toMatchObject({ role: "Player Character" });
    expect(await messagesOf(heir)).toEqual([`You're now the Game Master of ${campaign.name}`]);
    expect(await messagesOf(lateJoiner)).toEqual([`Someone invited you to ${campaign.name}`]);
    expect((await CampaignsService.getCampaign(heir.session, campaign.id)).permissions.canEdit).toBe(true);

    // Its own character passes to the new Game Master, whose seat holds it
    expect(await Characters.findOne(db, { id: gmsCharacter.id })).toMatchObject({ userId: heir.user.id });
    expect(await PlayerCharacters.findOne(db, { characterId: gmsCharacter.id })).toMatchObject({
      playerId: heir.player.id,
      visibility: "Private",
    });
    expect(await Characters.findOne(db, { id: heirsCharacter.id })).toMatchObject({ userId: heir.user.id });
  });

  test("names no one in what its new Game Master is told", async () => {
    const { campaign, gm, player } = await createParty();
    const username = `gone-${uniqueId()}`;
    await Users.update(db, { username }, { id: gm.user.id });

    await deleteAccount(gm);

    const { items } = await NotificationsService.getNotifications(player.session, {}, FIRST_PAGE);
    expect(items).toMatchObject([{ targetId: campaign.id, targetType: "campaigns", type: "promoteCampaignPlayer" }]);
    expect(JSON.stringify(items)).not.toContain(username);
    expect(JSON.stringify(items)).not.toContain(gm.user.emailAddress);
  });

  test("promotes no one while another live Game Master stays", async () => {
    const { campaign, gm, player } = await createParty();
    const other = await seatPlayer(campaign.id, "Game Master");
    const character = await linkCharacter(gm);

    await deleteAccount(gm);

    expect(await Players.findOne(db, { id: player.player.id })).toMatchObject({ role: "Player Character" });
    expect(await messagesOf(player)).toEqual([]);
    expect(await messagesOf(other)).toEqual([]);
    expect(await Characters.findOne(db, { id: character.id })).toMatchObject({ userId: other.user.id });
    expect(await Campaigns.findOne(db, { id: campaign.id })).toBeDefined();
  });

  test("is archived with nobody else seated, and its character deleted", async () => {
    const { user, session } = await createTestUser("alone");
    const { campaign, player } = await createTestCampaign(user.id);
    const character = await linkCharacter({ player, session, user });
    const familiar = await bondCreature(user.id, character.id);

    await deleteAccount({ session });

    expect(await Campaigns.findOne(db, { id: campaign.id })).toBeUndefined();
    expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.ArchivedOnly)).toBeDefined();
    await expectGone(character.id, familiar.id);
  });

  test("passes on when a player goes from a campaign no one runs, and their character with it", async () => {
    const { campaign, gm, player } = await createParty();
    const character = await linkCharacter(player);
    await Players.update(db, { role: "Player Character" }, { id: gm.player.id });

    await deleteAccount(player);

    expect((await Players.findOne(db, { id: gm.player.id }))?.role).toBe("Game Master");
    expect((await Characters.findOne(db, { id: character.id }))?.userId).toBe(gm.user.id);
    expect(await PlayerCharacters.findOne(db, { campaignId: campaign.id, characterId: character.id })).toMatchObject({
      playerId: gm.player.id,
    });
  });

  test("is archived when its last seated player goes from a campaign no one runs", async () => {
    const { campaign, gm, player } = await createParty();
    const character = await linkCharacter(player);
    await Players.delete(db, { id: gm.player.id });

    await deleteAccount(player);

    expect(await Campaigns.findOne(db, { id: campaign.id })).toBeUndefined();
    await expectGone(character.id);
  });

  test.each([
    ["Game Master", "Player Character"],
    ["Player Character", "Game Master"],
  ] as const)("hands on what both of an account's seats hold, its %s seat read first", async (first, second) => {
    const { campaign, gm, player } = await createParty();
    await Players.update(db, { role: first }, { id: gm.player.id });
    const [secondSeat] = await Players.create(db, { campaignId: campaign.id, role: second, userId: gm.user.id });
    const onFirstSeat = await linkCharacter(gm);
    const onSecondSeat = await linkCharacter({ ...gm, player: secondSeat });

    await deleteAccount(gm);

    expect((await Players.findOne(db, { id: player.player.id }))?.role).toBe("Game Master");
    for (const { id } of [onFirstSeat, onSecondSeat])
      expect((await Characters.findOne(db, { id }))?.userId).toBe(player.user.id);
  });

  test("never goes to an empty slot, a Game Master's neither", async () => {
    const { user, session } = await createTestUser("alone");
    const { campaign, player } = await createTestCampaign(user.id);
    const [playerSlot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
    const [masterSlot] = await Players.create(db, { campaignId: campaign.id, role: "Game Master" });
    const character = await linkCharacter({ player, session, user });

    await deleteAccount({ session });

    expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.ArchivedOnly)).toBeDefined();
    expect(await Players.findOne(db, { id: playerSlot.id })).toMatchObject({
      role: "Player Character",
      userId: null,
    });
    expect(await Players.findOne(db, { id: masterSlot.id })).toMatchObject({ userId: null });
    await expectGone(character.id);
  });

  test("passes to a player past an empty Game Master's slot, which runs nothing", async () => {
    const { campaign, gm, player } = await createParty();
    await Players.create(db, { campaignId: campaign.id, role: "Game Master" });

    await deleteAccount(gm);

    expect(await Players.findOne(db, { id: player.player.id })).toMatchObject({ role: "Game Master" });
    expect(await Campaigns.findOne(db, { id: campaign.id })).toBeDefined();
  });

  test("passes on though it's archived, so someone can restore or delete it, and keeps its archive date", async () => {
    const { campaign, gm, player } = await createParty();
    const [{ deletedAt }] = await Campaigns.archive(db, { id: campaign.id });
    const character = await linkCharacter(gm);

    await deleteAccount(gm);

    expect(await Players.findOne(db, { id: player.player.id })).toMatchObject({ role: "Game Master" });
    expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.ArchivedOnly)).toMatchObject({ deletedAt });
    const { permissions } = await CampaignsService.getCampaign(player.session, campaign.id);
    expect(permissions).toMatchObject({ canHardDelete: true, canUnarchive: true });
    await expectGone(character.id);
  });

  test("stays archived, as it was, with nobody else seated", async () => {
    const { user, session } = await createTestUser("alone");
    const { campaign } = await createTestCampaign(user.id);
    const [{ deletedAt }] = await Campaigns.archive(db, { id: campaign.id });

    await deleteAccount({ session });

    expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.ArchivedOnly)).toMatchObject({ deletedAt });
  });
});
