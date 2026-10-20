import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's character, and the routes of its own modifiers, as the user's key reads them. */
async function openModifiers() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { id } = await createTestCharacter(user.id);
  return { id, route: api.v1.characters[":id"].modifiers };
}

describe("v1 character modifiers", () => {
  test("adds a character's own modifier, lists it with its target named, changes it and deletes it", async () => {
    const { id, route } = await openModifiers();
    const json = { operator: "add", target: "abilities.strength.misc", value: "2" } as const;

    const created = await expectOk(route.$post({ json, param: { id } }));
    expect(created).toEqual({
      ...json,
      id: expect.any(String),
      targetLabels: ["Abilities", "Strength", "Misc"],
      valueLabel: null,
      valueType: "number",
    });
    expect(await expectOk(route.$get({ param: { id } }))).toEqual([created]);

    const modifierId = created.id;
    const changed = await expectOk(
      route[":modifierId"].$put({ json: { ...json, value: "4" }, param: { id, modifierId } }),
    );
    expect(changed).toMatchObject({ id: modifierId, value: "4" });

    await expectStatus(route[":modifierId"].$delete({ param: { id, modifierId } }), 204);
    expect(await expectOk(route.$get({ param: { id } }))).toEqual([]);
  });

  test("refuses a target no path names, and another user's character", async () => {
    const { id, route } = await openModifiers();
    await expectStatus(
      route.$post({ json: { operator: "add", target: "nowhere.at.all", value: "2" }, param: { id } }),
      400,
    );

    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    await expectStatus(api.v1.characters[":id"].modifiers.$get({ param: { id } }), 404);
    const modifierId = NIL_UUID;
    await expectStatus(route[":modifierId"].$delete({ param: { id, modifierId } }), 404);
  });
});
