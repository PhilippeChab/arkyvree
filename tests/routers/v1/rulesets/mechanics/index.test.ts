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
});
