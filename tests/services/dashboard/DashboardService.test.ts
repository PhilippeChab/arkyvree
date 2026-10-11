import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Campaigns, Characters, Rulesets } from "@/server/repositories/index.ts";
import { DashboardService } from "@/server/services/dashboard/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("DashboardService.getStats", () => {
  test("counts the user's own live characters and campaigns only", async () => {
    const { user, session } = await createTestUser();
    const { user: other } = await createTestUser();
    expect(await DashboardService.getStats(session)).toMatchObject({ totalCharacters: 0, totalCampaigns: 0 });

    const character = await createTestCharacter(user.id);
    await createTestCharacter(user.id);
    const { campaign } = await createTestCampaign(user.id);
    await createTestCampaign(user.id);
    await createTestCharacter(other.id);
    await createTestCampaign(other.id);
    expect(await DashboardService.getStats(session)).toMatchObject({ totalCharacters: 2, totalCampaigns: 2 });

    await Characters.archive(db, { id: character.id });
    await Campaigns.archive(db, { id: campaign.id });
    expect(await DashboardService.getStats(session)).toMatchObject({ totalCharacters: 1, totalCampaigns: 1 });
  });

  test("counts the rulesets available to the user: the bases, their own and the ones they contribute to", async () => {
    const { user, session } = await createTestUser();
    const { user: owner } = await createTestUser();
    const { totalRulesets: bases } = await DashboardService.getStats(session);
    expect(bases).toBeGreaterThan(0);

    const own = await createTestRuleset(user.id);
    await createTestRuleset(owner.id);
    const contributed = await createTestRuleset(owner.id);
    await addRulesetContributor(contributed.id, user, owner.id);
    expect((await DashboardService.getStats(session)).totalRulesets).toBe(bases + 2);

    await Rulesets.archive(db, { id: own.id });
    expect((await DashboardService.getStats(session)).totalRulesets).toBe(bases + 1);
  });
});
