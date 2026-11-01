import { describe, expect, test } from "bun:test";

import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findBaseRuleset, findNumberTarget, listEntities, readRulesOf } from "@/tests/support/v1.ts";

/** A customizable kind of a ruleset's rules: one its rules list, not one another owns. */
async function findCustomizable(api: Awaited<ReturnType<typeof createKeyedApi>>["api"], id: string) {
  const rules = await readRulesOf(api, id);
  return rules.customizable.find((type) => rules.kinds.some((kind) => kind.type === type)) as RulesetEntityType;
}

describe("v1 entity modifiers", () => {
  test("answers a customizable entity's modifiers and requirements, labeled", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findBaseRuleset(api);
    const rules = await readRulesOf(api, id);
    const customization = api.v1.rulesets[":id"].customization[":kind"][":entityId"];
    const kinds = rules.customizable.filter((customizable) => rules.kinds.some(({ type }) => type === customizable));

    // The first entity of a customizable kind's page that has requirements
    const requirements = [];
    for (const type of kinds) {
      for (const { id: entityId } of await listEntities(api, id, type, { limit: "50" })) {
        const param = { entityId, id, kind: type as RulesetEntityType };
        expect(Array.isArray(await expectOk(customization.modifiers.$get({ param })))).toBe(true);
        requirements.push(...(await expectOk(customization.requirements.$get({ param }))));
        if (requirements.length > 0) break;
      }
      if (requirements.length > 0) break;
    }
    expect(requirements[0]).toMatchObject({ targetLabels: expect.any(Object) });
  });

  test("adds a modifier and a requirement to an inherited entity, updates and removes them", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createFork(user.id, (await findBaseRuleset(api)).id);
    const kind = await findCustomizable(api, id);
    const [entity] = await listEntities(api, id, kind, { limit: "1" });
    const customization = api.v1.rulesets[":id"].customization[":kind"][":entityId"];
    const param = { entityId: entity!.id, id, kind };

    const json = { operator: "add", target: await findNumberTarget(api, id, kind), value: "2" };
    const added = await expectOk(customization.modifiers.$post({ json, param }));
    const modifier = added.find(({ target, value }) => target === json.target && value === "2")!;
    const modifierParam = { ...param, modifierId: modifier.id };
    const updated = await expectOk(
      customization.modifiers[":modifierId"].$put({ json: { ...json, value: "3" }, param: modifierParam }),
    );
    expect(updated).toContainEqual(expect.objectContaining({ target: json.target, value: "3" }));
    await expectStatus(customization.modifiers[":modifierId"].$delete({ param: modifierParam }), 204);

    const before = await expectOk(customization.requirements.$get({ param }));
    const requirements = await expectOk(
      customization.requirements.$post({ json: { chainingOperator: "and", level: "0" }, param }),
    );
    expect(requirements).toHaveLength(before.length + 1);
    const group = requirements.find(({ id }) => !before.some((old) => old.id === id))!;
    expect(group).toMatchObject({ chainingOperator: "and" });
    await expectStatus(
      customization.requirements[":requirementId"].$delete({ param: { ...param, requirementId: group.id } }),
      204,
    );
  });
});
