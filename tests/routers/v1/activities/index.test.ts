import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Activities } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { findSeededBase } from "@/tests/support/v1.ts";

/** A new user's key, and a campaign they created through it. */
async function setup() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { id: rulesetId } = await findSeededBase();
  const campaign = await expectOk(api.v1.campaigns.$post({ json: { name: "Logged", rulesetId } }));
  return { api, campaign, user };
}

describe("v1 activities", () => {
  test("lists what the key's user did, each's target named by its kind, filtered by kind or type", async () => {
    const { api, campaign } = await setup();
    const created = {
      createdAt: expect.any(String),
      data: null,
      id: expect.any(String),
      target: { id: campaign.id, kind: "campaigns" },
      type: "createCampaign",
    };
    expect(await expectOk(api.v1.activities.$get({ query: {} }))).toEqual({
      items: [created],
      nextPage: null,
      page: 1,
    });
    expect((await expectOk(api.v1.activities.$get({ query: { type: "archiveCampaign" } }))).items).toEqual([]);
  });

  test("searches and sorts by the type as it answers it, never as the app's feed titles it", async () => {
    const { api, campaign, user } = await setup();
    for (const type of ["addAdvancement", "addItem"])
      await Activities.create(db, { targetId: campaign.id, targetType: "characters", type, userId: user.id });
    const typesOf = async (query: Record<string, string>) =>
      (await expectOk(api.v1.activities.$get({ query }))).items.map(({ type }) => type);
    expect(await typesOf({ search: "level" })).toEqual([]);
    expect(await typesOf({ search: "advancement" })).toEqual(["addAdvancement"]);
    expect(await typesOf({ orderBy: "type", orderDir: "asc" })).toEqual([
      "addAdvancement",
      "addItem",
      "createCampaign",
    ]);
  });
});
