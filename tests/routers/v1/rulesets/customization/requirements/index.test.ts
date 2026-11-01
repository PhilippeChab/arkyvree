import { describe, expect, test } from "bun:test";

import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findBaseRuleset, findNumberTarget, listEntities, readRulesOf } from "@/tests/support/v1.ts";

describe("v1 entity requirements", () => {
  test("gives a modifier requirements, which say when it applies", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createFork(user.id, (await findBaseRuleset(api)).id);
    const rules = await readRulesOf(api, id);
    const kind = rules.customizable.find((type) => rules.kinds.some(({ type: listed }) => listed === type));
    const [entity] = await listEntities(api, id, kind!, { limit: "1" });
    const customization = api.v1.rulesets[":id"].customization[":kind"][":entityId"];

    const json = { operator: "add", target: await findNumberTarget(api, id, kind), value: "2" };
    const added = await expectOk(
      customization.modifiers.$post({ json, param: { entityId: entity!.id, id, kind: kind as RulesetEntityType } }),
    );
    const modifier = added.find(({ target, value }) => target === json.target && value === "2")!;
    const param = { entityId: modifier.id, id, kind: "modifiers" as const };
    const group = { chainingOperator: "and", level: "0" };
    expect(await expectOk(customization.requirements.$post({ json: group, param }))).toEqual([
      expect.objectContaining({ chainingOperator: "and" }),
    ]);
    expect(await expectOk(customization.requirements.$get({ param }))).toHaveLength(1);
  });
});
