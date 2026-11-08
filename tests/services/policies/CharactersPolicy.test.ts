import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import {
  Campaigns,
  CharacterContributors,
  Characters,
  PlayerCharacters,
  Players,
} from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import type { Character, Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { thrownBy } from "@/tests/support/errors.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A child of `parentId` (3.5's bonded creature): a kind no player character has, owned by its parent's owner. */
async function createChild(userId: string, parentId: string) {
  return await createTestCharacter(userId, { kind: "child", parentCharacterId: parentId });
}

/** A character of a new user's, with that user's session and a stranger's. */
async function setup() {
  const { user, session: owner } = await createTestUser();
  const { user: stranger, session: other } = await createTestUser();
  return { character: await createTestCharacter(user.id), owner, other, user, stranger };
}

/** Whether the session edits, reads and may edit each of a page's characters, by `forMany`, as `for` answers it. */
async function standingsOf(session: Pick<Session, "userId">, page: Character[]) {
  const policies = await CharactersPolicy.forMany(db, session, page);
  const many = page.map((entity) => {
    const policy = policies.get(entity.id);
    return [policy?.isEditor(), policy?.isReadable(), policy?.isEditable()];
  });
  const one = [];
  for (const entity of page) {
    const policy = await CharactersPolicy.for(db, session, entity);
    one.push([policy.isEditor(), policy.isReadable(), policy.isEditable()]);
  }
  expect(many).toEqual(one);
  return many;
}

describe("CharactersPolicy", () => {
  test("isReadable: its editors, a child's parent's", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).isReadable()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isReadable()).toBe(true);
    expect(new CharactersPolicy(other, character).isReadable()).toBe(false);

    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(other, child, { isParentEditor: true }).isReadable()).toBe(true);
    // Owning a child's row gives nothing of its own: its parent's editors read it
    expect(new CharactersPolicy(owner, child).isReadable()).toBe(false);
  });

  test("for: a contributor's rights come from their active role, a child's from its parent's", async () => {
    const { character, owner, other, user, stranger } = await setup();
    const child = await createChild(user.id, character.id);
    expect((await CharactersPolicy.for(db, other, character)).isReadable()).toBe(false);
    expect((await CharactersPolicy.for(db, other, child)).isReadable()).toBe(false);
    expect((await CharactersPolicy.for(db, owner, child)).isReadable()).toBe(true);

    await addCharacterContributor(character.id, stranger, user.id);
    expect((await CharactersPolicy.for(db, other, character)).isActiveContributor).toBe(true);
    expect((await CharactersPolicy.for(db, other, child)).isReadable()).toBe(true);
  });

  test("forMany: each of a page's policies as its for builds it, its contributions read at once", async () => {
    const { character, owner, other, user, stranger } = await setup();
    const child = await createChild(user.id, character.id);
    const [archived] = await Characters.archive(db, { id: (await createTestCharacter(user.id)).id });
    const page = [character, child, archived];
    const standings = (session: Pick<Session, "userId">) => standingsOf(session, page);
    // Its owner edits its characters, an archived one read-only, and reads the child; a stranger none
    expect(await standings(owner)).toEqual([
      [true, true, true],
      [false, true, true],
      [true, true, false],
    ]);
    expect(await standings(other)).toEqual([
      [false, false, false],
      [false, false, false],
      [false, false, false],
    ]);
    // Invited, it's no contributor yet; once active, the character and its child are its
    const [invite] = await CharacterContributors.create(db, {
      characterId: character.id,
      userId: stranger.id,
      email: stranger.emailAddress,
      role: "Editor",
      invitedBy: user.id,
    });
    expect((await standings(other))[0]).toEqual([false, false, false]);
    await CharacterContributors.update(db, { status: "Active" }, { id: invite.id });
    expect(await standings(other)).toEqual([
      [true, true, true],
      [false, true, true],
      [false, false, false],
    ]);
  });

  test("for and forMany: a live campaign's Game Master edits the characters linked to it, and reads their children", async () => {
    const { character, owner, other, user, stranger } = await setup();
    const child = await createChild(user.id, character.id);
    const [archived] = await Characters.archive(db, { id: (await createTestCharacter(user.id)).id });
    const unlinked = await createTestCharacter(user.id);
    const page = [character, child, archived, unlinked];
    const none = page.map(() => [false, false, false]);
    // The stranger runs a campaign the owner plays in, with another player
    const { campaign } = await createTestCampaign(stranger.id);
    const [seat] = await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Player Character" });
    const { user: fellow, session: player } = await createTestUser();
    await Players.create(db, { userId: fellow.id, campaignId: campaign.id, role: "Player Character" });
    expect(await standingsOf(other, page)).toEqual(none);

    await PlayerCharacters.create(db, { playerId: seat.id, characterId: character.id, visibility: "Private" });
    await PlayerCharacters.create(db, { playerId: seat.id, characterId: archived.id, visibility: "Private" });
    // Its Game Master edits what's linked to it, whatever its visibility, and reads a child through its parent; an
    // archived character, which its roster leaves out, is its owner's alone
    expect(await standingsOf(other, page)).toEqual([
      [true, true, true],
      [false, true, true],
      [false, false, false],
      [false, false, false],
    ]);
    expect(await standingsOf(owner, page)).toEqual([
      [true, true, true],
      [false, true, true],
      [true, true, false],
      [true, true, true],
    ]);
    // A player of the campaign edits none of the others' characters
    expect(await standingsOf(player, page)).toEqual(none);

    // Its own rights stay its owner's: its Game Master is neither its owner nor one of its contributors, so neither
    // reads its contributors nor gets its share token, which would outlast their seat
    const gameMaster = await CharactersPolicy.for(db, other, character);
    expect(thrownBy(() => gameMaster.canArchive())).toEqual(new NotFoundError("Character not found"));
    expect(thrownBy(() => gameMaster.canEditPortrait())).toEqual(
      new ForbiddenError("Only the owner can change the portrait"),
    );
    expect(thrownBy(() => gameMaster.canReadContributors())).toEqual(
      new ForbiddenError("Only the owner and contributors can see the contributors"),
    );
    expect(thrownBy(() => gameMaster.canManageContributors())).toEqual(
      new ForbiddenError("Only the owner can manage contributors"),
    );
    expect(thrownBy(() => gameMaster.canLeave())).toEqual(
      new NotFoundError("You are not a contributor of this character"),
    );
    expect(gameMaster.isShareTokenReader()).toBe(false);

    // An archived campaign is read-only: its Game Master edits nothing through it
    await Campaigns.archive(db, { id: campaign.id });
    expect(await standingsOf(other, page)).toEqual(none);
  });

  test("for: a Game Master's seat, a live one, in the character's own campaign, gives the edit", async () => {
    const { character, other, user, stranger } = await setup();
    const { user: master } = await createTestUser();
    const { campaign } = await createTestCampaign(master.id);
    const [seat] = await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Player Character" });
    await PlayerCharacters.create(db, { playerId: seat.id, characterId: character.id });
    // The stranger runs another campaign, and plays in this one
    await createTestCampaign(stranger.id);
    const [strangerSeat] = await Players.create(db, {
      userId: stranger.id,
      campaignId: campaign.id,
      role: "Player Character",
    });
    expect((await CharactersPolicy.for(db, other, character)).isEditor()).toBe(false);

    // Made a Game Master of it, it edits the character; its seat archived with its account, nothing
    await Players.update(db, { role: "Game Master" }, { id: strangerSeat.id });
    expect((await CharactersPolicy.for(db, other, character)).isEditor()).toBe(true);
    await Players.archive(db, { userId: stranger.id });
    expect((await CharactersPolicy.for(db, other, character)).isEditor()).toBe(false);
  });

  test("isShareTokenReader: a player character's owner and active contributors, a child's no one", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).isShareTokenReader()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isShareTokenReader()).toBe(true);
    expect(new CharactersPolicy(other, character, { isCampaignGameMaster: true }).isShareTokenReader()).toBe(false);
    expect(new CharactersPolicy(other, character).isShareTokenReader()).toBe(false);
    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(owner, child, { isParentEditor: true }).isShareTokenReader()).toBe(false);
  });

  test("canAcceptInvite: a character that isn't archived, a 409 for an archived one", async () => {
    const { character, other } = await setup();
    expect(new CharactersPolicy(other, character).canAcceptInvite({ status: "Pending" })).toBe(true);
    const [archived] = await Characters.archive(db, { id: character.id });
    expect(thrownBy(() => new CharactersPolicy(other, archived).canAcceptInvite({ status: "Pending" }))).toEqual(
      new ConflictError("This character is archived"),
    );
    // An answered invite is refused before its character's state
    expect(thrownBy(() => new CharactersPolicy(other, archived).canAcceptInvite({ status: "Rejected" }))).toEqual(
      new ConflictError("Invite is no longer pending"),
    );
  });

  test("refuses an archived character in one wording: an invite's accept, an edit, its rows' edit, an archive", async () => {
    const { character, other, owner } = await setup();
    const [archived] = await Characters.archive(db, { id: character.id });
    const policy = new CharactersPolicy(owner, archived);
    const refusal = new ConflictError("This character is archived");

    expect(thrownBy(() => new CharactersPolicy(other, archived).canAcceptInvite({ status: "Pending" }))).toEqual(
      refusal,
    );
    for (const check of ["canEdit", "canEditRows", "canArchive"] as const)
      expect(thrownBy(() => policy[check]())).toEqual(refusal);
  });

  test("canArchive, canShare and canLink: a player character's owner; anyone else as an unknown character", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    const contributor = new CharactersPolicy(other, character, { isActiveContributor: true });
    const campaign = { rulesetId: character.rulesetId };
    const seat = { id: NIL_UUID };
    const checks = [
      (policy: CharactersPolicy) => policy.canArchive(),
      (policy: CharactersPolicy) => policy.canLink(campaign, { seat }),
      (policy: CharactersPolicy) => policy.canShare(),
    ];
    for (const check of checks) {
      expect(check(new CharactersPolicy(owner, character))).toBe(true);
      expect(thrownBy(() => check(contributor))).toEqual(new NotFoundError("Character not found"));
      expect(thrownBy(() => check(new CharactersPolicy(owner, child, { isParentEditor: true })))).toEqual(
        new NotFoundError("Character not found"),
      );
    }
    // A campaign on another ruleset takes none of its owner's: a 422, after who's asking
    const elsewhere = { rulesetId: NIL_UUID };
    expect(thrownBy(() => new CharactersPolicy(owner, character).canLink(elsewhere, { seat }))).toEqual(
      new UnprocessableEntityError("Only characters built on the campaign's ruleset can be linked"),
    );
    expect(thrownBy(() => contributor.canLink(elsewhere, { seat }))).toEqual(new NotFoundError("Character not found"));
    // Linked already: from its own seat, the campaign's own link, a 409 on its state, after its ruleset's 422; from
    // another seat, another campaign's, a character the campaign can't take, a 422
    const own = new CharactersPolicy(owner, character);
    expect(thrownBy(() => own.canLink(campaign, { link: { playerId: seat.id }, seat }))).toEqual(
      new ConflictError("Character already linked to this campaign"),
    );
    const otherSeat = { playerId: crypto.randomUUID() };
    expect(thrownBy(() => own.canLink(campaign, { link: otherSeat, seat }))).toEqual(
      new UnprocessableEntityError("Character is already linked to a campaign"),
    );
    expect(thrownBy(() => own.canLink(elsewhere, { link: { playerId: seat.id }, seat }))).toEqual(
      new UnprocessableEntityError("Only characters built on the campaign's ruleset can be linked"),
    );
    // An archived one is a character the campaign can't take, a 422, before its own seat's link; its owner's alone
    const [archivedCharacter] = await Characters.archive(db, { id: (await createTestCharacter(character.userId)).id });
    const archivedRefusal = new UnprocessableEntityError("This character is archived");
    const ownArchived = new CharactersPolicy(owner, archivedCharacter);
    expect(thrownBy(() => ownArchived.canLink(campaign, { seat }))).toEqual(archivedRefusal);
    expect(thrownBy(() => ownArchived.canLink(campaign, { link: { playerId: seat.id }, seat }))).toEqual(
      archivedRefusal,
    );
    expect(thrownBy(() => new CharactersPolicy(other, archivedCharacter).canLink(campaign, { seat }))).toEqual(
      new NotFoundError("Character not found"),
    );
    // Who's asking comes first: a contributor gets the 404 an unknown character gets, linked or not
    expect(thrownBy(() => contributor.canLink(campaign, { link: { playerId: seat.id }, seat }))).toEqual(
      new NotFoundError("Character not found"),
    );

    // Archived, its owner unarchives it, and archives it no more; a live one isn't unarchived
    expect(thrownBy(() => new CharactersPolicy(owner, character).canUnarchive())).toEqual(
      new ConflictError("Character is not archived"),
    );
    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).canUnarchive()).toBe(true);
    expect(thrownBy(() => new CharactersPolicy(other, archived, { isActiveContributor: true }).canUnarchive())).toEqual(
      new NotFoundError("Character not found"),
    );
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canArchive())).toEqual(
      new ConflictError("This character is archived"),
    );
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canShare())).toEqual(
      new NotFoundError("Character not found"),
    );
  });

  test("canReadRows and canReadContributors: a player character's editors, archived or not; anyone else as an unknown character", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    const [archived] = await Characters.archive(db, { id: (await createTestCharacter(character.userId)).id });
    for (const check of ["canReadContributors", "canReadRows"] as const) {
      expect(new CharactersPolicy(owner, character)[check]()).toBe(true);
      expect(new CharactersPolicy(other, character, { isActiveContributor: true })[check]()).toBe(true);
      expect(new CharactersPolicy(owner, archived)[check]()).toBe(true);
      expect(thrownBy(() => new CharactersPolicy(other, character)[check]())).toEqual(
        new NotFoundError("Character not found"),
      );
      // A child's own rows are its parent's: its parent's editors read none of its own
      expect(thrownBy(() => new CharactersPolicy(owner, child, { isParentEditor: true })[check]())).toEqual(
        new NotFoundError("Character not found"),
      );
    }
  });

  test("canManageContributors: the owner; a contributor is forbidden, anyone else answered as unknown", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canManageContributors()).toBe(true);
    expect(
      thrownBy(() => new CharactersPolicy(other, character, { isActiveContributor: true }).canManageContributors()),
    ).toEqual(new ForbiddenError("Only the owner can manage contributors"));
    expect(thrownBy(() => new CharactersPolicy(other, character).canManageContributors())).toEqual(
      new NotFoundError("Character not found"),
    );
  });

  test("canRevokeContributor: managing them, of a contributor who's active or invited", async () => {
    const { character, owner, other } = await setup();
    for (const status of ["Active", "Pending"])
      expect(new CharactersPolicy(owner, character).canRevokeContributor({ status })).toBe(true);
    for (const status of ["Revoked", "Rejected"]) {
      expect(thrownBy(() => new CharactersPolicy(owner, character).canRevokeContributor({ status }))).toEqual(
        new ConflictError("Contributor is not active or pending"),
      );
    }
    expect(
      thrownBy(() =>
        new CharactersPolicy(other, character, { isActiveContributor: true }).canRevokeContributor({
          status: "Active",
        }),
      ),
    ).toEqual(new ForbiddenError("Only the owner can manage contributors"));
  });

  test("canLeave: its active contributor's; its owner contributes as no one, anyone else reads no character", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).canLeave()).toBe(true);
    expect(thrownBy(() => new CharactersPolicy(owner, character).canLeave())).toEqual(
      new NotFoundError("You are not a contributor of this character"),
    );
    expect(thrownBy(() => new CharactersPolicy(other, character).canLeave())).toEqual(
      new NotFoundError("Character not found"),
    );
  });

  test("canInviteContributors: managing them, on a character that isn't archived", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canInviteContributors()).toBe(true);
    expect(thrownBy(() => new CharactersPolicy(other, character).canInviteContributors())).toEqual(
      new NotFoundError("Character not found"),
    );

    // Its owner contributes as no one: a 422, before its state
    const ownerInvite = { invitee: { id: character.userId } };
    expect(thrownBy(() => new CharactersPolicy(owner, character).canInviteContributors(ownerInvite))).toEqual(
      new UnprocessableEntityError("Cannot invite the character owner as a contributor"),
    );

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canInviteContributors())).toEqual(
      new ConflictError("This character is archived"),
    );
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canInviteContributors(ownerInvite))).toEqual(
      new UnprocessableEntityError("Cannot invite the character owner as a contributor"),
    );
  });

  test("isEditable and isPortraitEditable: its readers while it isn't archived; a player character's portrait, its owner", async () => {
    const { character, owner, other } = await setup();
    const contributor = new CharactersPolicy(other, character, { isActiveContributor: true });
    expect(new CharactersPolicy(owner, character).isPortraitEditable()).toBe(true);
    expect(contributor.isEditable()).toBe(true);
    expect(contributor.isPortraitEditable()).toBe(false);
    expect(new CharactersPolicy(other, character).isEditable()).toBe(false);

    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(other, child, { isParentEditor: true }).isPortraitEditable()).toBe(true);

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).isEditable()).toBe(false);
    expect(new CharactersPolicy(owner, archived).isPortraitEditable()).toBe(false);
  });

  test("canEditPortrait: who first, the 404 an unknown character gets, then a 403; then its state, an archived one's a 409", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    const notFound = new NotFoundError("Character not found");
    const notOwner = new ForbiddenError("Only the owner can change the portrait");
    const archivedRefusal = new ConflictError("This character is archived");

    // A player character's owner, a child's editors: a contributor reads the character, and is refused it
    expect([
      new CharactersPolicy(owner, character).canEditPortrait(),
      new CharactersPolicy(other, child, { isParentEditor: true }).canEditPortrait(),
    ]).toEqual([true, true]);
    expect(thrownBy(() => new CharactersPolicy(other, character).canEditPortrait())).toEqual(notFound);
    expect(thrownBy(() => new CharactersPolicy(owner, child).canEditPortrait())).toEqual(notFound);
    const contributor = new CharactersPolicy(other, character, { isActiveContributor: true });
    expect(thrownBy(() => contributor.canEditPortrait())).toEqual(notOwner);

    // Archived, its owner's is refused on its state, after who: anyone else's refusal stays theirs
    const [archived] = await Characters.archive(db, { id: character.id });
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canEditPortrait())).toEqual(archivedRefusal);
    expect(
      thrownBy(() => new CharactersPolicy(other, archived, { isActiveContributor: true }).canEditPortrait()),
    ).toEqual(notOwner);
    expect(thrownBy(() => new CharactersPolicy(other, archived).canEditPortrait())).toEqual(notFound);
    const ofArchived = new CharactersPolicy(other, child, { isParentEditor: true, isParentArchived: true });
    expect(thrownBy(() => ofArchived.canEditPortrait())).toEqual(archivedRefusal);
  });

  test("canExport: its editors while they may edit it; anyone else, and an archived one, as an unknown character", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).canExport()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).canExport()).toBe(true);
    expect(thrownBy(() => new CharactersPolicy(other, character).canExport())).toEqual(
      new NotFoundError("Character not found"),
    );

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canExport())).toEqual(
      new NotFoundError("Character not found"),
    );
  });

  test("a live child under an archived parent is read-only, as its parent is", async () => {
    const { character, owner, user } = await setup();
    // Archiving the parent archives its children: a live one under it is left as if it hadn't been
    await Characters.archive(db, { id: character.id });
    const child = await createChild(user.id, character.id);

    const policy = await CharactersPolicy.for(db, owner, child);
    expect(policy.isReadable()).toBe(true);
    expect(policy.isEditable()).toBe(false);
    expect(policy.isPortraitEditable()).toBe(false);
  });

  test("isLinkable: whether canLink takes it, from the seat", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    const [archived] = await Characters.archive(db, { id: (await createTestCharacter(character.userId)).id });
    const campaign = { rulesetId: character.rulesetId };
    const seat = { id: NIL_UUID };
    const own = new CharactersPolicy(owner, character);
    expect(own.isLinkable(campaign, { seat })).toBe(true);
    // Another campaign's link, its seat's own, another ruleset, an archived one, a child, another's
    expect(own.isLinkable(campaign, { link: { playerId: crypto.randomUUID() }, seat })).toBe(false);
    expect(own.isLinkable(campaign, { link: { playerId: seat.id }, seat })).toBe(false);
    expect(own.isLinkable({ rulesetId: NIL_UUID }, { seat })).toBe(false);
    expect(new CharactersPolicy(owner, archived).isLinkable(campaign, { seat })).toBe(false);
    expect(new CharactersPolicy(owner, child, { isParentEditor: true }).isLinkable(campaign, { seat })).toBe(false);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isLinkable(campaign, { seat })).toBe(
      false,
    );
  });

  test("isRowEditable: its editors' while it's live; a child's own rows are its parent's, none of its own", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(owner, character).isRowEditable()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isRowEditable()).toBe(true);
    expect(new CharactersPolicy(other, character).isRowEditable()).toBe(false);
    // Its parent's editors edit a child's fields (`isEditable`), not rows of its own
    const childPolicy = new CharactersPolicy(owner, child, { isParentEditor: true });
    expect([childPolicy.isEditable(), childPolicy.isRowEditable()]).toEqual([true, false]);

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).isRowEditable()).toBe(false);
  });

  test("canEdit and canEditRows: who first, the 404 an unknown character gets; then its state, an archived one's a 409", async () => {
    const { character, owner, other } = await setup();
    const child = await createChild(character.userId, character.id);
    const notFound = new NotFoundError("Character not found");
    const archivedRefusal = new ConflictError("This character is archived");

    expect([
      new CharactersPolicy(owner, character).canEdit(),
      new CharactersPolicy(owner, character).canEditRows(),
      new CharactersPolicy(owner, child, { isParentEditor: true }).canEdit(),
    ]).toEqual([true, true, true]);
    expect(thrownBy(() => new CharactersPolicy(other, character).canEdit())).toEqual(notFound);
    expect(thrownBy(() => new CharactersPolicy(other, character).canEditRows())).toEqual(notFound);
    // A child's own rows are its parent's: its parent's editors edit none of its own
    expect(thrownBy(() => new CharactersPolicy(owner, child, { isParentEditor: true }).canEditRows())).toEqual(
      notFound,
    );

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canEdit())).toEqual(archivedRefusal);
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canEditRows())).toEqual(archivedRefusal);
    // Who may not edit it still gets the 404 first, archived or not
    expect(thrownBy(() => new CharactersPolicy(other, archived).canEditRows())).toEqual(notFound);
    // An archived parent's child is refused on its parent's state
    const ofArchived = new CharactersPolicy(owner, child, { isParentEditor: true, isParentArchived: true });
    expect(thrownBy(() => ofArchived.canEdit())).toEqual(archivedRefusal);
  });

  test("isEditor: a player character's owner and active contributors, archived or not; a child has none", async () => {
    const { character, owner, other } = await setup();
    expect(new CharactersPolicy(owner, character).isEditor()).toBe(true);
    expect(new CharactersPolicy(other, character, { isActiveContributor: true }).isEditor()).toBe(true);
    expect(new CharactersPolicy(other, character).isEditor()).toBe(false);

    const child = await createChild(character.userId, character.id);
    expect(new CharactersPolicy(owner, child, { isParentEditor: true }).isEditor()).toBe(false);

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(new CharactersPolicy(owner, archived).isEditor()).toBe(true);
  });

  test("canHardDelete: the owner, once archived and out of any active campaign", async () => {
    const { character, owner, other } = await setup();
    expect(thrownBy(() => new CharactersPolicy(owner, character).canHardDelete({ inActiveCampaign: false }))).toEqual(
      new ConflictError("Only archived characters can be permanently deleted"),
    );

    const [archived] = await Characters.archive(db, { id: character.id });
    expect(thrownBy(() => new CharactersPolicy(other, archived).canHardDelete({ inActiveCampaign: false }))).toEqual(
      new NotFoundError("Character not found"),
    );
    expect(new CharactersPolicy(owner, archived).canHardDelete({ inActiveCampaign: false })).toBe(true);
    expect(thrownBy(() => new CharactersPolicy(owner, archived).canHardDelete({ inActiveCampaign: true }))).toEqual(
      new ConflictError(
        "This character is linked to an active campaign and cannot be permanently deleted. Remove it from the campaign first.",
      ),
    );
  });

  test("refuses a demo its owner's contributors, its share link, its PDF and its portrait; it reads them", async () => {
    const { character, owner } = await setup();
    const policy = new CharactersPolicy({ ...owner, isDemo: true }, character);

    for (const check of ["canManageContributors", "canInviteContributors", "canShare", "canExport"] as const)
      expect(thrownBy(() => policy[check]())).toEqual(new ForbiddenError("Sign up to use this feature"));
    expect(thrownBy(() => policy.canRevokeContributor({ status: "Active" }))).toEqual(
      new ForbiddenError("Sign up to use this feature"),
    );
    expect(policy.isPortraitEditable()).toBe(false);
    expect(thrownBy(() => policy.canEditPortrait())).toEqual(new ForbiddenError("Sign up to use this feature"));
    // What it doesn't need an account for: reading them, editing its sheet, archiving it
    expect([policy.canReadContributors(), policy.isEditable(), policy.canArchive()]).toEqual([true, true, true]);
  });
});
