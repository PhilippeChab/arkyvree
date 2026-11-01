import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFormCharacter, findBaseRuleset, findNumberTarget } from "@/tests/support/v1.ts";

describe("v1 character modifiers", () => {
  test("adds a modifier of a character's own, at a path its ruleset completes, updates it and removes it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const character = await createFormCharacter(user.id, (await findBaseRuleset(api)).id);
    const characters = api.v1.characters[":id"];
    const param = { id: character.id };
    const target = await findNumberTarget(api, character.rulesetId);

    const json = { operator: "add", target, value: "2" };
    const created = await expectOk(characters.modifiers.$post({ json, param }));
    expect(created).toMatchObject({ target, value: "2" });
    const modifier = { ...param, modifierId: created.id };
    const updated = await expectOk(
      characters.modifiers[":modifierId"].$put({ json: { ...json, value: "4" }, param: modifier }),
    );
    expect(updated.value).toBe("4");
    await expectStatus(characters.modifiers[":modifierId"].$delete({ param: modifier }), 204);
    expect(await expectOk(characters.modifiers.$get({ param }))).toEqual([]);
  });
});
