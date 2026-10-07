import { describe, expect, test } from "bun:test";

import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const modifiers = api.api.characters.modifiers[":characterId"].modifiers;
const modifier = modifiers[":modifierId"];
const strengthBonus = { target: "abilities.strength.misc", value: "2", operator: "add" };

describe("character modifiers", () => {
  test("adds, lists, updates and removes a character's own modifier", async () => {
    const characterId = (await postCharacter()).id;
    expect(await expectOk(modifiers.$get({ param: { characterId } }))).toEqual([]);

    const created = await expectOk(modifiers.$post({ param: { characterId }, json: strengthBonus }));
    expect(created).toMatchObject({
      ...strengthBonus,
      valueType: "number",
      sourceType: "characters",
      sourceId: characterId,
    });
    const listed = await expectOk(modifiers.$get({ param: { characterId } }));
    expect(listed).toMatchObject([{ id: created.id, targetLabels: expect.any(Object) }]);

    const param = { characterId, modifierId: created.id };
    expect(await expectOk(modifier.$put({ param, json: { ...strengthBonus, value: "4" } }))).toMatchObject({
      value: "4",
    });

    await expectOk(modifier.$delete({ param }));
    expect(await expectOk(modifiers.$get({ param: { characterId } }))).toEqual([]);
  });

  test("applies the modifier to the character sheet", async () => {
    const { abilityMap } = await getSeedCtx();
    const characterId = (await postCharacter()).id;
    await expectOk(modifiers.$post({ param: { characterId }, json: strengthBonus }));

    const detail = await expectOk(api.api.characters[":id"].$get({ param: { id: characterId } }));
    const strength = Object.values(detail.abilities).find((a) => a.abilityId === abilityMap["Strength"]);
    expect(strength).toMatchObject({ base: 10, total: 12 });
  });

  test("refuses an unknown operator or target", async () => {
    const characterId = (await postCharacter()).id;
    await expectStatus(
      modifiers.$post({ param: { characterId }, json: { ...strengthBonus, operator: "invalid" } }),
      400,
    );
    await expectStatus(
      modifiers.$post({ param: { characterId }, json: { ...strengthBonus, target: "not.a.path" } }),
      400,
    );
  });

  test("refuses a path a character's own modifier can't target: a pool's slots", async () => {
    const characterId = (await postCharacter()).id;
    const json = { target: "aptitudes.general.allowed", value: "1", operator: "add" };
    await expectStatus(modifiers.$post({ param: { characterId }, json }), 400);
  });

  test("refuses a value that isn't of its target's type, and takes a template", async () => {
    const characterId = (await postCharacter()).id;
    const created = await expectOk(modifiers.$post({ param: { characterId }, json: strengthBonus }));
    for (const value of ["abc", "true"])
      await expectStatus(modifiers.$post({ param: { characterId }, json: { ...strengthBonus, value } }), 400);

    const param = { characterId, modifierId: created.id };
    await expectStatus(modifier.$put({ param, json: { ...strengthBonus, value: "two" } }), 400);
    const halfLevel = "{{ floor([identity.meta.level] / 2) }}";
    expect(await expectOk(modifier.$put({ param, json: { ...strengthBonus, value: halfLevel } }))).toMatchObject({
      value: halfLevel,
    });
  });

  test("hides another user's character", async () => {
    const characterId = (await postCharacter()).id;
    const { api: other } = await createSignedInUser("other");
    const theirs = other.api.characters.modifiers[":characterId"].modifiers;
    await expectStatus(theirs.$get({ param: { characterId } }), 404);
    await expectStatus(theirs.$post({ param: { characterId }, json: strengthBonus }), 404);
  });

  test("requires a session", async () => {
    const characterId = (await postCharacter()).id;
    await expectStatus(
      guestApi.api.characters.modifiers[":characterId"].modifiers.$get({ param: { characterId } }),
      401,
    );
  });

  test("returns 404 for a missing character or modifier", async () => {
    const characterId = (await postCharacter()).id;
    await expectStatus(modifiers.$get({ param: { characterId: NIL_UUID } }), 404);
    const param = { characterId, modifierId: NIL_UUID };
    await expectStatus(modifier.$put({ param, json: strengthBonus }), 404);
    await expectStatus(modifier.$delete({ param }), 404);
  });
});
