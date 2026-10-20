import { describe, expect, test } from "bun:test";

import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset mechanics", () => {
  test("lists a ruleset's mechanics, and answers one", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const { api } = await createKeyedApi(session.userId);
    const mechanic = await MechanicsService.createMechanic(session, ruleset.id, {
      description: "Flanking",
      name: "Flank",
    });
    const route = api.v1.rulesets[":id"].mechanics;
    const expected = { description: "Flanking", id: mechanic.id, name: "Flank" };

    expect((await expectOk(route.$get({ param: { id: ruleset.id }, query: {} }))).items).toEqual([expected]);
    const answer = route[":mechanicId"].$get({ param: { id: ruleset.id, mechanicId: mechanic.id } });
    expect(await expectOk(answer)).toEqual(expected);
    await expectStatus(route[":mechanicId"].$get({ param: { id: ruleset.id, mechanicId: NIL_UUID } }), 404);
  });

  test("adds a mechanic to a user's ruleset, changes it and deletes it, and refuses one the user can't edit", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const { api } = await createKeyedApi(session.userId);
    const route = api.v1.rulesets[":id"].mechanics;
    const id = ruleset.id;

    const created = await expectOk(route.$post({ json: { name: "Flank" }, param: { id } }));
    expect(created).toEqual({ description: null, id: expect.any(String), name: "Flank" });
    const mechanicId = created.id;
    const changed = await expectOk(
      route[":mechanicId"].$put({
        json: { description: "From two sides", name: "Flanking" },
        param: { id, mechanicId },
      }),
    );
    expect(changed).toEqual({ description: "From two sides", id: mechanicId, name: "Flanking" });
    await expectStatus(route[":mechanicId"].$delete({ param: { id, mechanicId } }), 204);
    await expectStatus(route[":mechanicId"].$get({ param: { id, mechanicId } }), 404);

    const { api: otherApi } = await createKeyedApi();
    await expectStatus(otherApi.v1.rulesets[":id"].mechanics.$post({ json: { name: "Flank" }, param: { id } }), 403);
  });
});
