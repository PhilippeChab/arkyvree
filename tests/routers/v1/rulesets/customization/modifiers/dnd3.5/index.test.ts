import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
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

describe("v1 entity modifiers", () => {
  test("answers an entity's modifiers and requirements, labeled", async () => {
    const { api } = await createKeyedApi();
    const { featMap, rulesetId: id } = await getSeedCtx();
    const customization = api.v1.rulesets[":id"].customization[":kind"][":entityId"];
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" as const };

    expect(await expectOk(customization.modifiers.$get({ param }))).toEqual(expect.any(Array));
    const requirements = await expectOk(customization.requirements.$get({ param }));
    expect(requirements).toContainEqual(expect.objectContaining({ targetLabels: expect.any(Object) }));
  });

  test("adds a modifier and a requirement to an entity, updates and removes them", async () => {
    const { id, rulesets } = await keyedFork();
    const { aptMap } = await getSeedCtx();
    const created = await expectOk(
      rulesets.entities[":kind"].$post({
        json: { links: { listedIn: [{ toId: aptMap.General! }] }, name: "Keyed Feat" },
        param: { id, kind: "feats" },
      }),
    );
    const customization = rulesets.customization[":kind"][":entityId"];
    const param = { entityId: created.id, id, kind: "feats" as const };

    const json = { operator: "add", target: "abilities.strength.misc", value: "2" };
    const [modifier] = await expectOk(customization.modifiers.$post({ json, param }));
    expect(modifier).toMatchObject({ target: "abilities.strength.misc", value: "2" });
    const modifierParam = { ...param, modifierId: modifier!.id };
    const [updated] = await expectOk(
      customization.modifiers[":modifierId"].$put({ json: { ...json, value: "3" }, param: modifierParam }),
    );
    expect(updated?.value).toBe("3");
    await expectStatus(customization.modifiers[":modifierId"].$delete({ param: modifierParam }), 204);

    const requirements = await expectOk(
      customization.requirements.$post({ json: { chainingOperator: "and", level: "0" }, param }),
    );
    expect(requirements).toEqual([expect.objectContaining({ chainingOperator: "and" })]);
    const requirementParam = { ...param, requirementId: requirements[0]!.id };
    await expectStatus(customization.requirements[":requirementId"].$delete({ param: requirementParam }), 204);
  });
});
