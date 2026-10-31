import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Players, Users } from "@/server/repositories/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { CampaignRole } from "@/shared/enums.ts";
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
      expect(gm.canDelete()).toBe(true);
    }
  });

  test("refuses players and outsiders", async () => {
    for (const role of ["Player Character", null] as const) {
      const { policy } = await policyFor(role);
      expect(policy.isGameMaster()).toBe(false);
      expect(() => policy.canUpdate()).toThrow(ForbiddenError);
      expect(() => policy.canDelete()).toThrow(ForbiddenError);
      expect(() => policy.canHardDelete()).toThrow(ForbiddenError);
    }
  });

  test("canAcceptInvite: a campaign that isn't archived, a 409 for an archived one", async () => {
    const { campaign, policy } = await policyFor(null);
    expect(policy.canAcceptInvite()).toBe(true);
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    expect(() => new CampaignsPolicy({ userId: "invitee" }, archived).canAcceptInvite()).toThrow(ConflictError);
  });

  test("canRead: the session's player row, the 404 an unknown campaign gets for an outsider", async () => {
    const { policy } = await policyFor("Player Character");
    expect(policy.canRead().role).toBe("Player Character");
    expect(policy.isReadable()).toBe(true);
    const { policy: outsider } = await policyFor(null);
    expect(() => outsider.canRead()).toThrow(NotFoundError);
    expect(() => outsider.canRead()).toThrow("Campaign not found");
    expect(outsider.isReadable()).toBe(false);
  });

  test("canLinkCharacter: a member's seat, a 404 for an outsider, a 403 on an archived campaign", async () => {
    for (const role of ["Player Character", "Game Master"] as const) {
      const { policy } = await policyFor(role);
      expect(policy.canLinkCharacter().role).toBe(role);
    }
    const { policy: outsider } = await policyFor(null);
    expect(() => outsider.canLinkCharacter()).toThrow(NotFoundError);
    expect(() => outsider.canLinkCharacter()).toThrow("Campaign not found");

    const { campaign, session } = await policyFor("Player Character");
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const policy = await CampaignsPolicy.for(db, session, archived);
    expect(() => policy.canLinkCharacter()).toThrow("Cannot modify an archived campaign");
  });

  test("canSeeCharacter: a member sees a linked character, a Private one only its player and the Game Master", async () => {
    const { policy: gameMaster } = await policyFor("Game Master");
    const { policy: player } = await policyFor("Player Character");
    const { policy: outsider } = await policyFor(null);
    const ownLink = { playerId: player.canRead().id, visibility: "Private" };

    for (const visibility of ["Public", "Partial", "Private"]) {
      expect(gameMaster.canSeeCharacter({ playerId: NIL_UUID, visibility })).toBe(true);
      expect(() => outsider.canSeeCharacter({ playerId: NIL_UUID, visibility })).toThrow("Campaign not found");
    }
    expect(player.canSeeCharacter(ownLink)).toBe(true);
    expect(player.canSeeCharacter({ playerId: NIL_UUID, visibility: "Partial" })).toBe(true);
    expect(() => player.canSeeCharacter({ playerId: NIL_UUID, visibility: "Private" })).toThrow(NotFoundError);
  });

  test("refuses the Game Master of another campaign", async () => {
    const { campaign } = await policyFor(null);
    const { session: otherGameMaster } = await policyFor("Game Master");
    const policy = await CampaignsPolicy.for(db, otherGameMaster, campaign);
    expect(() => policy.canUpdate()).toThrow(ForbiddenError);
  });

  test("lets the Game Master of an archived campaign read and unarchive it, but not edit it", async () => {
    const { campaign, session } = await policyFor("Game Master");
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    const policy = await CampaignsPolicy.for(db, session, archived);
    expect(policy.canRead().role).toBe("Game Master");
    expect(policy.canDelete()).toBe(true);
    expect(policy.canSeeCharacter({ playerId: NIL_UUID, visibility: "Private" })).toBe(true);
    expect(() => policy.canModify()).toThrow(ForbiddenError);
  });

  test("gives a seat archived with its user's account nothing", async () => {
    const { campaign, session } = await policyFor("Game Master");
    // As deleting an account does: its seats archived, then its user
    await Players.archive(db, { userId: session.userId });
    await Users.archive(db, { id: session.userId });
    const policy = await CampaignsPolicy.for(db, session, campaign);
    expect(policy.isGameMaster()).toBe(false);
    expect(() => policy.canRead()).toThrow(NotFoundError);
    expect(policy.isReadable()).toBe(false);
    expect(() => policy.canDelete()).toThrow(ForbiddenError);
  });

  test("only deletes an archived campaign permanently", async () => {
    const { campaign, session, policy } = await policyFor("Game Master");
    expect(() => policy.canHardDelete()).toThrow(UnprocessableEntityError);

    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    expect((await CampaignsPolicy.for(db, session, archived)).canHardDelete()).toBe(true);
  });
});
