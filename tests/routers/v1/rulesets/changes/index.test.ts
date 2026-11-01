import { describe, expect, test } from "bun:test";

import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findBaseRuleset, findKind, listEntities, readRulesOf } from "@/tests/support/v1.ts";

/** A new user's key, a fork of theirs of the base ruleset, and its rules as `GET /v1/rules` describes them. */
async function keyedFork() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { id: baseId } = await findBaseRuleset(api);
  const fork = await createFork(user.id, baseId);
  return {
    api,
    baseId,
    id: fork.id,
    rules: await readRulesOf(api, fork.id),
    rulesets: api.v1.rulesets[":id"],
    userId: user.id,
  };
}

describe("v1 ruleset changes", () => {
  test("answers what a fork changed of its parent, and refuses a ruleset that's no fork", async () => {
    const { baseId, id, rules, rulesets, userId } = await keyedFork();
    // A kind whose entity takes a name alone
    const { type } = findKind(
      rules,
      (kind) =>
        !kind.readOnly &&
        !kind.partitioned &&
        !kind.templates &&
        !(rules.fields[kind.type] ?? []).some(({ required }) => Boolean(required)),
    );
    const body = { description: null, name: "Test Entity" };
    const added = await EntitiesService.createEntity({ userId }, id, type as RulesetEntityType, body);

    expect(await expectOk(rulesets.changes.$get({ param: { id } }))).toEqual([
      { entityId: added.id, kind: type, name: "Test Entity", sourceId: null, status: "added" },
    ]);
    await expectStatus(rulesets.changes.$get({ param: { id: baseId } }), 400);
  });

  test("edits an inherited entity as the fork's copy, and restores it to its parent's", async () => {
    const { api, id, rules, rulesets } = await keyedFork();
    const { type } = findKind(rules, ({ readOnly, templates }) => !readOnly && !templates);
    const [inherited] = await listEntities(api, id, type, { limit: "1" });
    const param = { entityId: inherited!.id, id, kind: type as RulesetEntityType };

    const edited = await expectOk(
      rulesets.entities[":kind"][":entityId"].$put({ json: { description: "Edited", name: inherited!.name }, param }),
    );
    expect(edited.description).toBe("Edited");
    const changes = await expectOk(rulesets.changes.$get({ param: { id } }));
    expect(changes).toContainEqual(
      expect.objectContaining({ entityId: edited.id, kind: type, sourceId: inherited!.id, status: "modified" }),
    );
    // Restored by the parent's id, which the fork's entity keeps showing as
    expect(await expectOk(rulesets.entities[":kind"][":entityId"].restore.$post({ param }))).toEqual([]);
  });
});
