import { describe, expect, test } from "bun:test";

import { createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** A new user whose only activities are forking the seeded ruleset, then adding an aptitude to the fork. */
async function userWithActivities() {
  const { rulesetId } = await getSeedCtx();
  const { api } = await createSignedInUser("activity");
  const fork = await expectOk(
    api.api.rulesets[":id"].fork.$post({
      param: { id: rulesetId },
      json: { name: "Activity Fork", description: "", private: true },
    }),
  );
  const aptitude = await expectOk(
    api.api.rulesets[":id"].aptitudes.$post({ param: { id: fork.id }, json: { name: "Activity Aptitude" } }),
  );
  return { activities: api.api.activities, fork, aptitude };
}

describe("activities", () => {
  test("lists, sorts and pages the user's activities", async () => {
    const { activities } = await userWithActivities();
    // Both rows share the test transaction's timestamp, so sort by type to get a stable order.
    const ascending = await expectOk(activities.$get({ query: { orderBy: "type", orderDir: "asc" } }));
    expect(ascending.items.map((a) => a.type)).toEqual(["createAptitude", "forkRuleset"]);
    const descending = await expectOk(activities.$get({ query: { orderBy: "type", orderDir: "desc" } }));
    expect(descending.items.map((a) => a.type)).toEqual(["forkRuleset", "createAptitude"]);
    const firstPage = await expectOk(activities.$get({ query: { limit: "1" } }));
    expect(firstPage.items).toHaveLength(1);
  });

  test("filters activities by type and searches their type and table", async () => {
    const { activities, aptitude } = await userWithActivities();
    const byType = await expectOk(activities.$get({ query: { type: "createAptitude" } }));
    expect(byType.items.map((a) => a.targetId)).toEqual([aptitude.id]);
    const searched = await expectOk(activities.$get({ query: { search: "fork" } }));
    expect(searched.items.map((a) => a.type)).toEqual(["forkRuleset"]);
    expect((await expectOk(activities.$get({ query: { search: "zzzznonexistent" } }))).items).toEqual([]);
  });

  test("resolves an activity's target to a page", async () => {
    const { activities, fork, aptitude } = await userWithActivities();
    const resolve = activities.resolve[":targetTable"][":targetId"];
    expect(await expectOk(resolve.$get({ param: { targetTable: "aptitudes", targetId: aptitude.id } }))).toEqual({
      url: `/rulesets/${fork.id}/aptitudes/${aptitude.id}`,
    });
    await expectStatus(resolve.$get({ param: { targetTable: "aptitudes", targetId: NIL_UUID } }), 404);
  });

  test("requires a session", async () => {
    await expectStatus(guestApi.api.activities.$get({ query: {} }), 401);
  });
});
