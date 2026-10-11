import { describe, expect, test } from "bun:test";

import { createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("dashboard", () => {
  test("counts the user's characters and campaigns, and the rulesets available to them", async () => {
    const { rulesetId } = await getSeedCtx();
    const { api } = await createSignedInUser("dashboard");
    // A new user already has the published base rulesets.
    const before = await expectOk(api.api.dashboard.stats.$get());
    expect(before).toMatchObject({ totalCharacters: 0, totalCampaigns: 0 });
    expect(before.totalRulesets).toBeGreaterThan(0);

    await expectOk(
      api.api.rulesets[":id"].fork.$post({
        param: { id: rulesetId },
        json: { name: "Dashboard Fork", description: "", private: true },
      }),
    );
    await postCampaign({ name: "Dashboard Campaign" }, api);
    expect(await expectOk(api.api.dashboard.stats.$get())).toEqual({
      totalRulesets: before.totalRulesets + 1,
      totalCharacters: 0,
      totalCampaigns: 1,
    });
  });

  test("requires a session", async () => {
    await expectStatus(guestApi.api.dashboard.stats.$get(), 401);
  });
});
