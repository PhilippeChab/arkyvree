import { describe, expect, test } from "bun:test";
import { api, createSignedInUser, expectOk, guestApi } from "@/tests/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

const modifiers = api.api.characters.modifiers[":characterId"].modifiers;
const modifier = modifiers[":modifierId"];
const strengthBonus = { target: "abilities.strength.misc", value: "2", operator: "add" };

async function createCharacter() {
  const ctx = await getSeedCtx();
  const abilities = Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10]));
  const created = await expectOk(api.api.characters.$post({
    json: {
      rulesetId: ctx.rulesetId, raceId: ctx.raceMap.pc["Human"], name: "Modified Character", xp: 0, alignment: "True Neutral",
      abilities, age: 25, gender: "Male", height: "180", weight: "80",
    },
  }));
  return created.id;
}

describe("character modifiers", () => {
  test("adds, lists, updates and removes a character's own modifier", async () => {
    const characterId = await createCharacter();
    expect(await expectOk(modifiers.$get({ param: { characterId } }))).toEqual([]);

    const created = await expectOk(modifiers.$post({ param: { characterId }, json: strengthBonus }));
    expect(created).toMatchObject({ ...strengthBonus, valueType: "number", sourceType: "characters", sourceId: characterId });
    const listed = await expectOk(modifiers.$get({ param: { characterId } }));
    expect(listed).toMatchObject([{ id: created.id, targetLabels: expect.any(Object) }]);

    const param = { characterId, modifierId: created.id };
    expect(await expectOk(modifier.$put({ param, json: { ...strengthBonus, value: "4" } }))).toMatchObject({ value: "4" });

    await expectOk(modifier.$delete({ param }));
    expect(await expectOk(modifiers.$get({ param: { characterId } }))).toEqual([]);
  });

  test("applies the modifier to the character sheet", async () => {
    const { abilityMap } = await getSeedCtx();
    const characterId = await createCharacter();
    await expectOk(modifiers.$post({ param: { characterId }, json: strengthBonus }));

    const detail = await expectOk(api.api.characters[":id"].$get({ param: { id: characterId } }));
    const strength = Object.values(detail.abilities).find((a) => a.abilityId === abilityMap["Strength"]);
    expect(strength).toMatchObject({ base: 10, total: 12 });
  });

  test("refuses an unknown operator or target", async () => {
    const characterId = await createCharacter();
    expect((await modifiers.$post({ param: { characterId }, json: { ...strengthBonus, operator: "invalid" } })).status).toBe(400);
    expect((await modifiers.$post({ param: { characterId }, json: { ...strengthBonus, target: "not.a.path" } })).status).toBe(400);
  });

  test("hides another user's character", async () => {
    const characterId = await createCharacter();
    const { api: other } = await createSignedInUser("other");
    const theirs = other.api.characters.modifiers[":characterId"].modifiers;
    expect((await theirs.$get({ param: { characterId } })).status).toBe(404);
    expect((await theirs.$post({ param: { characterId }, json: strengthBonus })).status).toBe(404);
  });

  test("requires a session", async () => {
    const characterId = await createCharacter();
    expect((await guestApi.api.characters.modifiers[":characterId"].modifiers.$get({ param: { characterId } })).status).toBe(401);
  });

  test("returns 404 for a missing character or modifier", async () => {
    const characterId = await createCharacter();
    expect((await modifiers.$get({ param: { characterId: NIL_UUID } })).status).toBe(404);
    const param = { characterId, modifierId: NIL_UUID };
    expect((await modifier.$put({ param, json: strengthBonus })).status).toBe(404);
    expect((await modifier.$delete({ param })).status).toBe(404);
  });
});
