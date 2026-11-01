import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a fork of the seeded ruleset of theirs. */
async function keyedFork() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const fork = await createSeededTestRuleset(user.id);
  return { api, fork, id: fork.id, rulesets: api.v1.rulesets[":id"] };
}

describe("v1 ruleset settings", () => {
  test("updates a ruleset's settings", async () => {
    const { id, rulesets } = await keyedFork();
    const { abilityMap } = await getSeedCtx();
    const settings = await expectOk(
      rulesets.settings.$put({ json: { links: { skillPointAbility: abilityMap.Wisdom! } }, param: { id } }),
    );
    expect(settings.links).toMatchObject({ skillPointAbility: abilityMap.Wisdom });
  });
});
