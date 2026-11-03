import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Players, Users, Visibility } from "@/server/repositories/index.ts";
import { CampaignsPolicy, CharactersPolicy, readRefusal } from "@/server/services/policies/index.ts";
import { CHARACTER_VISIBILITY_OPTIONS } from "@/shared/campaigns.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { measure } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { thrownBy } from "@/tests/support/errors.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A campaign, and the policy of a new user holding `role` in it (or no seat at all). */
async function policyFor(role: CampaignRole | null) {
  const { rulesetId } = await getSeedCtx();
  const [campaign] = await Campaigns.create(db, { name: "Policy Campaign", rulesetId });
  const { user, session } = await createTestUser();
  if (role) await Players.create(db, { userId: user.id, campaignId: campaign.id, role });
  return { campaign, session, policy: await CampaignsPolicy.for(db, session, campaign) };
}

describe("CampaignsPolicy", () => {
  test("lets any Game Master of the campaign edit and archive it", async () => {
    const { campaign, policy } = await policyFor("Game Master");
    const { user, session } = await createTestUser();
    await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Game Master" });

    for (const gm of [policy, await CampaignsPolicy.for(db, session, campaign)]) {
      expect(gm.isGameMaster()).toBe(true);
      expect(gm.canUpdate()).toBe(true);
      expect([gm.canEdit(), gm.canArchive()]).toEqual([true, true]);
      // A live campaign isn't unarchived
      expect(thrownBy(() => gm.canUnarchive())).toEqual(new ConflictError("Campaign is not archived"));
    }
  });

  test("refuses players and outsiders", async () => {
    for (const role of ["Player Character", null] as const) {
      const { policy } = await policyFor(role);
      expect(policy.isGameMaster()).toBe(false);
      expect(thrownBy(() => policy.canUpdate())).toEqual(
        new ForbiddenError("Only the Game Master can edit this campaign"),
      );
      for (const [check, what] of [
        ["canEdit", "edit"],
        ["canArchive", "manage"],
        ["canUnarchive", "manage"],
        ["canHardDelete", "permanently delete"],
      ] as const) {
        expect(thrownBy(() => policy[check]())).toEqual(
          new ForbiddenError(`Only the Game Master can ${what} this campaign`),
        );
      }
    }
  });

  test("canRemovePlayer and canUpdatePlayer: the Game Master's, a player's own leave; never the last Game Master", async () => {
    const { policy: gameMaster, session } = await policyFor("Game Master");
    const { policy: player, session: playerSession } = await policyFor("Player Character");
    const live = { deletedAt: null, userId: NIL_UUID };
    const other = { isLastGameMaster: false };

    expect([gameMaster.canRemovePlayer(live, other), gameMaster.canUpdatePlayer(live, other)]).toEqual([true, true]);
    expect(player.canRemovePlayer({ deletedAt: null, userId: playerSession.userId }, other)).toBe(true);
    expect(thrownBy(() => player.canRemovePlayer(live, other))).toEqual(
      new ForbiddenError("Only the Game Master can edit this campaign"),
    );
    expect(thrownBy(() => player.canUpdatePlayer(live, other))).toEqual(
      new ForbiddenError("Only the Game Master can edit this campaign"),
    );
    // The last Game Master stays, a Game Master still; a seat archived with its user's account is no one's to change
    const last = { isLastGameMaster: true };
    const self = { deletedAt: null, userId: session.userId };
    expect(thrownBy(() => gameMaster.canRemovePlayer(self, last))).toEqual(
      new ConflictError("Cannot remove the last Game Master from a campaign"),
    );
    expect(thrownBy(() => gameMaster.canUpdatePlayer(self, last))).toEqual(
      new ConflictError("Cannot demote the last Game Master"),
    );
    expect(gameMaster.canUpdatePlayer(self, { ...last, role: "Game Master" })).toBe(true);
    const archivedSeat = { deletedAt: new Date().toISOString(), userId: NIL_UUID };
    for (const check of [
      () => gameMaster.canRemovePlayer(archivedSeat, other),
      () => gameMaster.canUpdatePlayer(archivedSeat, other),
    ])
      expect(thrownBy(check)).toEqual(new NotFoundError("Player not found in this campaign"));
  });

  test("canInviteToSeat: the Game Master's, to a live seat without a user or a pending invite", async () => {
    const { policy: gameMaster } = await policyFor("Game Master");
    const { policy: player } = await policyFor("Player Character");
    const open = { deletedAt: null, userId: null };
    expect(gameMaster.canInviteToSeat(open, { pendingInvite: false })).toBe(true);
    expect(thrownBy(() => gameMaster.canInviteToSeat({ ...open, userId: NIL_UUID }, { pendingInvite: false }))).toEqual(
      new ConflictError("Player already has a user assigned"),
    );
    expect(thrownBy(() => gameMaster.canInviteToSeat(open, { pendingInvite: true }))).toEqual(
      new ConflictError("This player slot already has a pending invite"),
    );
    // Who's asking first, whatever the seat's state
    expect(thrownBy(() => player.canInviteToSeat(open, { pendingInvite: true }))).toEqual(
      new ForbiddenError("Only the Game Master can edit this campaign"),
    );
    // A seat archived with its user's account is no one's to invite to, as it's no one's to change or remove: not found
    // first, its user aside
    const archivedSeat = { deletedAt: new Date().toISOString(), userId: NIL_UUID };
    for (const policy of [gameMaster, player]) {
      for (const seat of [archivedSeat, { ...archivedSeat, userId: null }]) {
        expect(thrownBy(() => policy.canInviteToSeat(seat, { pendingInvite: false }))).toEqual(
          new NotFoundError("Player not found in this campaign"),
        );
      }
    }
  });

  test("canRevokeInvite: the Game Master, of a pending invite, an archived campaign's too", async () => {
    const { campaign, policy } = await policyFor("Game Master");
    expect([policy.canRevokeInvite(), policy.canRevokeInvite({ status: "Pending" })]).toEqual([true, true]);
    for (const status of ["Accepted", "Rejected", "Revoked"]) {
      expect(thrownBy(() => policy.canRevokeInvite({ status }))).toEqual(
        new ConflictError("Only pending invites can be revoked"),
      );
    }
    // Who's asking first: a player is refused whatever the invite's status
    const { policy: player } = await policyFor("Player Character");
    expect(thrownBy(() => player.canRevokeInvite({ status: "Revoked" }))).toEqual(
      new ForbiddenError("Only the Game Master can edit this campaign"),
    );

    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const gameMaster = new CampaignsPolicy({ userId: "game-master" }, archived, policy.canRead());
    expect(gameMaster.canRevokeInvite({ status: "Pending" })).toBe(true);
  });

  test("canAcceptInvite: a campaign that isn't archived, a 409 for an archived one", async () => {
    const { campaign, policy } = await policyFor(null);
    expect(policy.canAcceptInvite({ status: "Pending" })).toBe(true);
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    expect(
      thrownBy(() => new CampaignsPolicy({ userId: "invitee" }, archived).canAcceptInvite({ status: "Pending" })),
    ).toEqual(new ConflictError("This campaign is archived"));
  });

  test("canAcceptInvite and canAnswerInvite: a pending invite, a 409 for an answered or a revoked one, before its campaign's state", async () => {
    const { campaign, policy } = await policyFor(null);
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const onArchived = new CampaignsPolicy({ userId: "invitee" }, archived);
    const noLonger = new ConflictError("Invite is no longer pending");
    expect(policy.canAnswerInvite({ status: "Pending" })).toBe(true);
    for (const status of ["Accepted", "Rejected", "Revoked"]) {
      expect(thrownBy(() => policy.canAcceptInvite({ status }))).toEqual(noLonger);
      expect(thrownBy(() => onArchived.canAcceptInvite({ status }))).toEqual(noLonger);
      expect(thrownBy(() => policy.canAnswerInvite({ status }))).toEqual(noLonger);
    }
  });

  test("refuses an archived campaign in one wording: an invite's accept, a seated invitee's too, an edit, an archive", async () => {
    const { campaign, session } = await policyFor("Game Master");
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const gameMaster = await CampaignsPolicy.for(db, session, archived);
    const refusal = new ConflictError("This campaign is archived");

    // Who holds a seat already (an invite they took over with another address) is told its state, checked first
    for (const invitee of [new CampaignsPolicy({ userId: "invitee" }, archived), gameMaster])
      expect(thrownBy(() => invitee.canAcceptInvite({ status: "Pending" }))).toEqual(refusal);
    for (const check of ["canEdit", "canArchive"] as const)
      expect(thrownBy(() => gameMaster[check]())).toEqual(refusal);
  });

  test("canAcceptInvite: a 409 for who already holds a seat in it", async () => {
    const { policy } = await policyFor("Player Character");
    expect(thrownBy(() => policy.canAcceptInvite({ status: "Pending" }))).toEqual(
      new ConflictError("You already hold a seat in this campaign"),
    );
  });

  test("canRead: the session's player row, the 404 an unknown campaign gets for an outsider", async () => {
    const { policy } = await policyFor("Player Character");
    expect(policy.canRead().role).toBe("Player Character");
    expect(policy.isReadable()).toBe(true);
    const { policy: outsider } = await policyFor(null);
    expect(thrownBy(() => outsider.canRead())).toEqual(new NotFoundError("Campaign not found"));
    expect(outsider.isReadable()).toBe(false);
  });

  test("canLinkCharacter: a member's seat, a 404 for an outsider, the character's refusal, then a 409 on an archived campaign", async () => {
    for (const role of ["Player Character", "Game Master"] as const) {
      const { policy } = await policyFor(role);
      expect(policy.canLinkCharacter().role).toBe(role);
    }
    const { policy: outsider } = await policyFor(null);
    expect(thrownBy(() => outsider.canLinkCharacter())).toEqual(new NotFoundError("Campaign not found"));

    const { campaign, session } = await policyFor("Player Character");
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const policy = await CampaignsPolicy.for(db, session, archived);
    expect(() => policy.canLinkCharacter()).toThrow("This campaign is archived");
    // The character it names, another record, is checked from the seat after who, before the campaign's state: another
    // user's is its policy's 404, and one of the session's linked from its seat already its own 409
    const { user: other } = await createTestUser();
    const othersCharacter = new CharactersPolicy(session, await createTestCharacter(other.id));
    expect(thrownBy(() => policy.canLinkCharacter(othersCharacter))).toEqual(new NotFoundError("Character not found"));
    const own = new CharactersPolicy(session, await createTestCharacter(session.userId));
    expect(thrownBy(() => policy.canLinkCharacter(own, { playerId: policy.canRead().id }))).toEqual(
      new ConflictError("Character already linked to this campaign"),
    );
    expect(thrownBy(() => outsider.canLinkCharacter(othersCharacter))).toEqual(new NotFoundError("Campaign not found"));
  });

  test("canExportCharacter: the Game Master, or whoever exports the character themselves", async () => {
    const { user } = await createTestUser();
    const character = await createTestCharacter(user.id);
    const { policy: gm, session } = await policyFor("Game Master");
    const { policy: player } = await policyFor("Player Character");
    const stranger = new CharactersPolicy(session, character);
    const editor = new CharactersPolicy(session, character, { isActiveContributor: true });

    expect(gm.canExportCharacter(stranger)).toBe(true);
    expect(player.canExportCharacter(editor)).toBe(true);
    expect(thrownBy(() => player.canExportCharacter(stranger))).toEqual(new NotFoundError("Character not found"));
  });

  test("canSeeCharacter: a member sees a linked character, a Private one only its player and the Game Master", async () => {
    const { policy: gameMaster } = await policyFor("Game Master");
    const { policy: player } = await policyFor("Player Character");
    const { policy: outsider } = await policyFor(null);
    const ownLink = { playerId: player.canRead().id, visibility: "Private" as const };

    for (const visibility of CHARACTER_VISIBILITY_OPTIONS) {
      expect(gameMaster.canSeeCharacter({ playerId: NIL_UUID, visibility })).toBe(true);
      expect(() => outsider.canSeeCharacter({ playerId: NIL_UUID, visibility })).toThrow("Campaign not found");
    }
    expect(player.canSeeCharacter(ownLink)).toBe(true);
    expect(player.canSeeCharacter({ playerId: NIL_UUID, visibility: "Partial" })).toBe(true);
    expect(thrownBy(() => player.canSeeCharacter({ playerId: NIL_UUID, visibility: "Private" }))).toEqual(
      new NotFoundError("Character not found in this campaign"),
    );
  });

  test("isAddressReader: the Game Master reads every address; a player their own slot's alone", async () => {
    const { policy: gameMaster } = await policyFor("Game Master");
    const { policy: player, session } = await policyFor("Player Character");

    expect([gameMaster.isAddressReader(), gameMaster.isSlotAddressReader(NIL_UUID)]).toEqual([true, true]);
    expect([
      player.isAddressReader(),
      player.isSlotAddressReader(NIL_UUID),
      player.isSlotAddressReader(session.userId),
    ]).toEqual([false, false, true]);
    // A slot nobody holds yet (an invite's) is no player's own
    expect(player.isSlotAddressReader(null)).toBe(false);
  });

  test("canSetCharacterVisibility: its seat's own link; another's a 403, one it doesn't see or none a 404", async () => {
    const { policy: player } = await policyFor("Player Character");
    const { policy: gameMaster } = await policyFor("Game Master");
    const own = { playerId: player.canRead().id, visibility: "Private" as const };
    expect(player.canSetCharacterVisibility(own)).toBe(player.canRead());

    const notLinked = new NotFoundError("Character not found in this campaign");
    expect(thrownBy(() => player.canSetCharacterVisibility(undefined))).toEqual(notLinked);
    // Another seat's Private link is one it doesn't see: as not linked, never revealed by a 403
    expect(thrownBy(() => player.canSetCharacterVisibility({ playerId: NIL_UUID, visibility: "Private" }))).toEqual(
      notLinked,
    );
    expect(thrownBy(() => player.canSetCharacterVisibility({ playerId: NIL_UUID, visibility: "Public" }))).toEqual(
      new ForbiddenError("You do not own this character in this campaign"),
    );
    // The Game Master sees every link, and sets none but its own seat's
    expect(thrownBy(() => gameMaster.canSetCharacterVisibility({ playerId: NIL_UUID, visibility: "Private" }))).toEqual(
      new ForbiddenError("You do not own this character in this campaign"),
    );
  });

  test("canSetCharacterVisibility: who and its link, then an archived campaign's 409", async () => {
    const { campaign, policy, session } = await policyFor("Player Character");
    const archived = new CampaignsPolicy(
      session,
      { ...campaign, deletedAt: new Date().toISOString() },
      policy.canRead(),
    );
    const own = { playerId: policy.canRead().id, visibility: "Public" as const };

    expect(thrownBy(() => archived.canSetCharacterVisibility(own))).toEqual(
      new ConflictError("This campaign is archived"),
    );
    // No link, or another seat's: the link's 404, or who's 403, before the campaign's state
    expect(thrownBy(() => archived.canSetCharacterVisibility(undefined))).toEqual(
      new NotFoundError("Character not found in this campaign"),
    );
    expect(thrownBy(() => archived.canSetCharacterVisibility({ playerId: NIL_UUID, visibility: "Public" }))).toEqual(
      new ForbiddenError("You do not own this character in this campaign"),
    );
  });

  test("isLinkOwner: a link on its own seat, no other seat's, and none for an outsider", async () => {
    const { campaign, policy: player } = await policyFor("Player Character");
    const { user, session } = await createTestUser();
    await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Game Master" });
    const gameMaster = await CampaignsPolicy.for(db, session, campaign);
    const { policy: outsider } = await policyFor(null);

    expect([
      player.isLinkOwner({ playerId: player.canRead().id }),
      player.isLinkOwner({ playerId: gameMaster.canRead().id }),
      // The Game Master sees every link, and owns none but its own seat's
      gameMaster.isLinkOwner({ playerId: player.canRead().id }),
      gameMaster.isLinkOwner({ playerId: gameMaster.canRead().id }),
      outsider.isLinkOwner({ playerId: NIL_UUID }),
    ]).toEqual([true, false, false, true, false]);
  });

  test("canSeeCharacters: every link for the Game Master, a player's own Private ones alone, a 404 for an outsider", async () => {
    const { policy: gameMaster } = await policyFor("Game Master");
    const { policy: player } = await policyFor("Player Character");
    const { policy: outsider } = await policyFor(null);

    expect(gameMaster.canSeeCharacters()).toEqual({ visibilityPlayerId: undefined });
    expect(player.canSeeCharacters()).toEqual({ visibilityPlayerId: player.canRead().id });
    expect(thrownBy(() => outsider.canSeeCharacters())).toEqual(new NotFoundError("Campaign not found"));
  });

  test("isPartialReader and isPrivateNotesReader: a Partial character is whole to its player, the Game Master and its editors", async () => {
    const { user } = await createTestUser();
    const character = await createTestCharacter(user.id);
    const { policy: gameMaster, session } = await policyFor("Game Master");
    const { policy: player } = await policyFor("Player Character");
    const reader = new CharactersPolicy(session, character);
    const editor = new CharactersPolicy(session, character, { isActiveContributor: true });
    const partial = { playerId: NIL_UUID, visibility: "Partial" as const };

    expect(player.isPartialReader(partial, reader)).toBe(true);
    expect([
      player.isPartialReader({ ...partial, visibility: "Public" }, reader),
      player.isPartialReader({ ...partial, playerId: player.canRead().id }, reader),
      player.isPartialReader(partial, editor),
      gameMaster.isPartialReader(partial, reader),
    ]).toEqual([false, false, false, false]);
    expect([
      player.isPrivateNotesReader(reader),
      player.isPrivateNotesReader(editor),
      gameMaster.isPrivateNotesReader(reader),
    ]).toEqual([false, true, true]);
  });

  test("refuses the Game Master of another campaign", async () => {
    const { campaign } = await policyFor(null);
    const { session: otherGameMaster } = await policyFor("Game Master");
    const policy = await CampaignsPolicy.for(db, otherGameMaster, campaign);
    expect(thrownBy(() => policy.canUpdate())).toEqual(
      new ForbiddenError("Only the Game Master can edit this campaign"),
    );
  });

  test("lets the Game Master of an archived campaign read and unarchive it, but not edit it", async () => {
    const { campaign, session } = await policyFor("Game Master");
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const policy = await CampaignsPolicy.for(db, session, archived);
    expect(policy.canRead().role).toBe("Game Master");
    expect(policy.canUnarchive()).toBe(true);
    expect(policy.canSeeCharacter({ playerId: NIL_UUID, visibility: "Private" })).toBe(true);
    // Read-only: its edit and its archive are refused on its state
    for (const check of ["canEdit", "canArchive", "canModify"] as const)
      expect(thrownBy(() => policy[check]())).toEqual(new ConflictError("This campaign is archived"));
  });

  test("gives a seat archived with its user's account nothing", async () => {
    const { campaign, session } = await policyFor("Game Master");
    // As deleting an account does: its seats archived, then its user
    await Players.archive(db, { userId: session.userId });
    await Users.archive(db, { id: session.userId });
    const policy = await CampaignsPolicy.for(db, session, campaign);
    expect(policy.isGameMaster()).toBe(false);
    expect(thrownBy(() => policy.canRead())).toEqual(new NotFoundError("Campaign not found"));
    expect(policy.isReadable()).toBe(false);
    expect(thrownBy(() => policy.canArchive())).toEqual(
      new ForbiddenError("Only the Game Master can manage this campaign"),
    );
  });

  test("only deletes an archived campaign permanently", async () => {
    const { campaign, session, policy } = await policyFor("Game Master");
    expect(thrownBy(() => policy.canHardDelete())).toEqual(
      new ConflictError("Only archived campaigns can be permanently deleted"),
    );

    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    expect((await CampaignsPolicy.for(db, session, archived)).canHardDelete()).toBe(true);
  });

  test("refuses a demo its players' management and its characters' PDFs, as their Game Master too", async () => {
    const { campaign, session } = await policyFor("Game Master");
    const demo = await CampaignsPolicy.for(db, { ...session, isDemo: true }, campaign);
    const { user } = await createTestUser();
    const character = new CharactersPolicy(session, await createTestCharacter(user.id));

    expect(demo.isGameMaster()).toBe(true);
    for (const check of [() => demo.canManagePlayers(), () => demo.canExportCharacter(character)])
      expect(thrownBy(check)).toEqual(new ForbiddenError("Sign up to use this feature"));
    expect(demo.canEdit()).toBe(true);
  });

  test("forMany: a page's policies, its seats read at once", async () => {
    const { campaign: led, session } = await policyFor("Game Master");
    const { campaign: unseated } = await policyFor(null);
    const { campaign: archived } = await policyFor(null);
    await Players.create(db, { campaignId: archived.id, role: "Player Character", userId: session.userId });
    await Campaigns.archive(db, { id: archived.id });
    const page = [led, unseated, (await Campaigns.findOne(db, { id: archived.id }, Visibility.All))!];

    const { result: policies, timing } = await measure(() => CampaignsPolicy.forMany(db, session, page));
    expect(timing.queryCount).toBe(1);
    // Whether it leads it, reads it, and may accept an invite to a seat in it
    expect(
      page.map(({ id }) => {
        const policy = policies.get(id)!;
        return [
          policy.isGameMaster(),
          policy.isReadable(),
          readRefusal(() => policy.canAcceptInvite({ status: "Pending" })),
        ];
      }),
    ).toEqual([
      [true, true, "You already hold a seat in this campaign"],
      [false, false, null],
      // An archived campaign keeps its seats, which read it
      [false, true, "This campaign is archived"],
    ]);
  });
});
