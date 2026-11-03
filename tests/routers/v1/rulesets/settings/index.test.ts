import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findBaseRuleset, listEntities, readRulesOf } from "@/tests/support/v1.ts";

describe("v1 ruleset settings", () => {
  test("updates a setting the rules' ruleset fields name, by the entity it references", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createFork(user.id, (await findBaseRuleset(api)).id);
    const rules = await readRulesOf(api, id);
    const settings = api.v1.rulesets[":id"].settings;
    // A setting that references an entity, and another entity of its kind than the one it has
    const field = (rules.fields.rulesets ?? []).find(({ references, role }) => typeof role === "string" && references)!;
    const role = field.role as string;
    const before = await expectOk(settings.$get({ param: { id } }));
    const entities = await listEntities(api, id, field.references as string, { limit: "50" });
    const other = entities.find((entity) => entity.id !== before.links[role])!;

    const updated = await expectOk(settings.$put({ json: { links: { [role]: other.id } }, param: { id } }));
    expect(updated.links).toMatchObject({ [role]: other.id });
  });
});
