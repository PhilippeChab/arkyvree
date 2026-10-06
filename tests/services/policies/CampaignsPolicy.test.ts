import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { playersInCampaign } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Players } from "@/server/repositories/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { createTestUser, getSeedCtx } from "@/tests/helpers.ts";

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

  test("canRead: the session's player row, a 403 for an outsider", async () => {
    const { policy } = await policyFor("Player Character");
    expect(policy.canRead().role).toBe("Player Character");
    const { policy: outsider } = await policyFor(null);
    expect(() => outsider.canRead()).toThrow("You are not a member of this campaign");
  });

  test("refuses the Game Master of another campaign", async () => {
    const { campaign } = await policyFor(null);
    const { session: otherGameMaster } = await policyFor("Game Master");
    const policy = await CampaignsPolicy.for(db, otherGameMaster, campaign);
    expect(() => policy.canUpdate()).toThrow(ForbiddenError);
  });

  test("still lets the Game Master archive a campaign whose players were archived with it, but not edit it", async () => {
    const { campaign, session } = await policyFor("Game Master");
    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    await db
      .update(playersInCampaign)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(playersInCampaign.campaignId, campaign.id));
    const policy = await CampaignsPolicy.for(db, session, archived);
    expect(policy.canDelete()).toBe(true);
    expect(policy.isGameMaster()).toBe(false);
  });

  test("only deletes an archived campaign permanently", async () => {
    const { campaign, session, policy } = await policyFor("Game Master");
    expect(() => policy.canHardDelete()).toThrow(UnprocessableEntityError);

    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    expect((await CampaignsPolicy.for(db, session, archived)).canHardDelete()).toBe(true);
  });
});
