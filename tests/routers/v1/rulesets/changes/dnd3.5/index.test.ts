import { describe, expect, test } from "bun:test";

import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
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

describe("v1 ruleset changes", () => {
  test("answers what a fork changed of its parent, and refuses a ruleset that's no fork", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const fork = await createSeededTestRuleset(user.id);
    const added = await EntitiesService.createEntity({ userId: user.id }, fork.id, "languages", {
      description: null,
      name: "Test Tongue",
    });
    const changes = api.v1.rulesets[":id"].changes;
    expect(await expectOk(changes.$get({ param: { id: fork.id } }))).toEqual([
      { entityId: added.id, kind: "languages", name: "Test Tongue", sourceId: null, status: "added" },
    ]);
    await expectStatus(changes.$get({ param: { id: (await getSeedCtx()).rulesetId } }), 400);
  });

  test("edits an inherited entity as the fork's copy, and restores it to its parent's", async () => {
    const { id, rulesets } = await keyedFork();
    const { featMap } = await getSeedCtx();
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" as const };
    const inherited = await expectOk(rulesets.entities[":kind"][":entityId"].$get({ param }));

    const edited = await expectOk(
      rulesets.entities[":kind"][":entityId"].$put({
        json: { description: "Hit harder", name: inherited.name },
        param,
      }),
    );
    expect(edited.description).toBe("Hit harder");
    const changes = await expectOk(rulesets.changes.$get({ param: { id } }));
    const change = changes.find(({ kind, status }) => kind === "feats" && status === "modified");
    expect(change).toMatchObject({ entityId: edited.id, sourceId: param.entityId });
    // Restored by the parent's id, which the fork's entity keeps showing as
    const restored = await expectOk(rulesets.entities[":kind"][":entityId"].restore.$post({ param }));
    expect(restored).toEqual([]);
  });
});
