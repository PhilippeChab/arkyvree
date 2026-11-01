import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a fork of the seeded ruleset of theirs. */
async function keyedFork() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const fork = await createSeededTestRuleset(user.id);
  return { api, fork, id: fork.id, rulesets: api.v1.rulesets[":id"] };
}

describe("v1 target paths", () => {
  test("completes and validates a target path", async () => {
    const { id, rulesets } = await keyedFork();
    const paths = rulesets.customization.target.paths;
    const completions = await expectOk(
      paths.completions.$post({ json: { kind: "modifier", partialPath: "abil", position: 4 }, param: { id } }),
    );
    expect(completions.items.length).toBeGreaterThan(0);
    const valid = await expectOk(
      paths.validate.$post({ json: { kind: "modifier", path: "abilities.strength.misc" }, param: { id } }),
    );
    expect(valid.isValid).toBe(true);
  });
});
