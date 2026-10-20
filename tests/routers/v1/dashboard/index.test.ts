import { describe, expect, test } from "bun:test";

import { DashboardService } from "@/server/services/dashboard/index.ts";
import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("v1 dashboard", () => {
  test("answers how many campaigns, characters and rulesets the key's user has", async () => {
    const { user, session } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    await createTestCharacter(user.id);
    await createTestCharacter(user.id);
    await createTestCampaign(user.id);

    const { totalRulesets } = await DashboardService.getStats(session);
    expect(await expectOk(api.v1.dashboard.stats.$get())).toEqual({
      campaigns: 1,
      characters: 2,
      rulesets: totalRulesets,
    });
  });
});
