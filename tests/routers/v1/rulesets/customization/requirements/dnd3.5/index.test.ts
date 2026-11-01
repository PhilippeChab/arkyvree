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

describe("v1 entity requirements", () => {
  test("gives a modifier requirements, which say when it applies", async () => {
    const { id, rulesets } = await keyedFork();
    const { aptMap } = await getSeedCtx();
    const feat = await expectOk(
      rulesets.entities[":kind"].$post({
        json: { links: { listedIn: [{ toId: aptMap.General! }] }, name: "Keyed Feat" },
        param: { id, kind: "feats" },
      }),
    );
    const json = { operator: "add", target: "abilities.strength.misc", value: "2" };
    const customization = rulesets.customization[":kind"][":entityId"];
    const [modifier] = await expectOk(
      customization.modifiers.$post({ json, param: { entityId: feat.id, id, kind: "feats" } }),
    );
    const param = { entityId: modifier!.id, id, kind: "modifiers" as const };
    expect(
      await expectOk(customization.requirements.$post({ json: { chainingOperator: "and", level: "0" }, param })),
    ).toEqual([expect.objectContaining({ chainingOperator: "and" })]);
    expect(await expectOk(customization.requirements.$get({ param }))).toHaveLength(1);
  });
});
