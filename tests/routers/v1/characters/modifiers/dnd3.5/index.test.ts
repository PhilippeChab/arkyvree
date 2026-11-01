import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a character of theirs. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createTestCharacter(user.id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id } };
}

describe("v1 character modifiers", () => {
  test("adds a modifier of a character's own, updates it and removes it", async () => {
    const { characters, param } = await keyedCharacter();
    const json = { operator: "add", target: "abilities.strength.misc", value: "2" };
    const created = await expectOk(characters.modifiers.$post({ json, param }));
    expect(created).toMatchObject({ target: "abilities.strength.misc", value: "2" });

    const modifier = { ...param, modifierId: created.id };
    const updated = await expectOk(
      characters.modifiers[":modifierId"].$put({ json: { ...json, value: "4" }, param: modifier }),
    );
    expect(updated.value).toBe("4");
    await expectStatus(characters.modifiers[":modifierId"].$delete({ param: modifier }), 204);
  });
});
