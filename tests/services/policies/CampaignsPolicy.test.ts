import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { playersInCampaign } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Players } from "@/server/repositories/index.ts";
import CampaignsPolicy from "@/server/services/policies/CampaignsPolicy.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { createTestUser, getSeedCtx } from "@/tests/helpers.ts";

/** A campaign, and the policy of a new user holding `role` in it (or no seat at all). */
async function policyFor(role: CampaignRole | null) {
  const { rulesetId } = await getSeedCtx();
  const [campaign] = await Campaigns.create(db, { name: "Policy Campaign", rulesetId });
  const { user, session } = await createTestUser();
  if (role) await Players.create(db, { userId: user.id, campaignId: campaign.id, role });
  return { campaign, session, policy: new CampaignsPolicy(session, campaign) };
}

describe("CampaignsPolicy", () => {
  test("lets any Game Master of the campaign edit and archive it", async () => {
    const { campaign, policy } = await policyFor("Game Master");
    const { user, session } = await createTestUser();
    await Players.create(db, { userId: user.id, campaignId: campaign.id, role: "Game Master" });

    for (const gm of [policy, new CampaignsPolicy(session, campaign)]) {
      expect(await gm.canUpdate()).toBe(true);
      expect(await gm.canDelete()).toBe(true);
    }
  });

  test("refuses players and outsiders", async () => {
    for (const role of ["Player Character", null] as const) {
      const { policy } = await policyFor(role);
      await expect(policy.canUpdate()).rejects.toThrow(ForbiddenError);
      await expect(policy.canDelete()).rejects.toThrow(ForbiddenError);
      await expect(policy.canHardDelete()).rejects.toThrow(ForbiddenError);
    }
  });

  test("refuses the Game Master of another campaign", async () => {
    const { campaign } = await policyFor(null);
    const { session: otherGameMaster } = await policyFor("Game Master");
    await expect(new CampaignsPolicy(otherGameMaster, campaign).canUpdate()).rejects.toThrow(ForbiddenError);
  });

  test("still recognizes the Game Master once the campaign is archived", async () => {
    const { campaign, policy } = await policyFor("Game Master");
    await Campaigns.archive(db, { id: campaign.id });
    await db
      .update(playersInCampaign)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(playersInCampaign.campaignId, campaign.id));
    expect(await policy.canDelete()).toBe(true);
  });

  test("only deletes an archived campaign permanently", async () => {
    const { campaign, session, policy } = await policyFor("Game Master");
    await expect(policy.canHardDelete()).rejects.toThrow(UnprocessableEntityError);

    const [archived] = await Campaigns.archive(db, { id: campaign.id });
    expect(await new CampaignsPolicy(session, archived).canHardDelete()).toBe(true);
  });
});
