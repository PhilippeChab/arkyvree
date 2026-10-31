import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { findPlainItem } from "@/tests/support/dnd3.5/items.ts";
import { FIGHTER_LEVELS, picks } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { CHARACTER_ALIGNMENT, CHARACTER_GENDER, CHARACTER_XP } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A new user's key, and a character of theirs. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createTestCharacter(user.id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id } };
}

describe("v1 character writes", () => {
  test("creates a character from its creation's reads, answering its sheet", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId } = await getSeedCtx();

    const creation = await expectOk(api.v1.characters.creation.$get({ query: { role: "score", rulesetId } }));
    expect(creation.entities.length).toBe(6);
    const races = await expectOk(
      api.v1.characters.creation[":role"].$get({ param: { role: "race" }, query: { rulesetId, search: "Human" } }),
    );
    const human = races.items.find(({ name }) => name === "Human")!;
    expect(human).toMatchObject({ eligible: true });

    const scores = Object.fromEntries(creation.entities.map(({ id }) => [id, 12]));
    const sheet = await expectOk(
      api.v1.characters.$post({
        json: {
          fields: { [CHARACTER_ALIGNMENT]: "Neutral Good", [CHARACTER_GENDER]: "Female", [CHARACTER_XP]: 0 },
          name: "Keyed Hero",
          picks: { race: human.id },
          rulesetId,
          scores: { score: scores },
        },
      }),
    );
    expect(sheet).toMatchObject({ archived: false, name: "Keyed Hero", rulesetId });

    const raised = Object.fromEntries(creation.entities.map(({ id }) => [id, 14]));
    const param = { id: sheet.id, role: "score" };
    await expectOk(api.v1.characters[":id"].scores[":role"].$put({ json: raised, param }));
  });

  test("updates a character, refusing a stale update", async () => {
    const { characters, param } = await keyedCharacter();
    const read = await expectOk(characters.$get({ param }));
    const renamed = await expectOk(characters.$put({ json: { name: "Renamed", updatedAt: read.updatedAt }, param }));
    expect(renamed.name).toBe("Renamed");
    await expectStatus(characters.$put({ json: { name: "Stale", updatedAt: read.updatedAt }, param }), 409);
  });

  test("archives a character, unarchives it, and deletes an archived one for good", async () => {
    const { characters, param } = await keyedCharacter();
    await expectStatus(characters.$delete({ param }), 204);
    expect((await expectOk(characters.$get({ param }))).archived).toBe(true);
    expect((await expectOk(characters.unarchive.$post({ param }))).archived).toBe(false);
    await expectStatus(characters.$delete({ param }), 204);
    await expectStatus(characters.permanent.$delete({ param }), 204);
    await expectStatus(characters.$get({ param }), 404);
  });

  test("imports a character from a PCGen file, with what the import did", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId } = await getSeedCtx();
    const text = await readPcgenFile("hilda");
    const imported = await expectOk(api.v1.characters.import.$post({ json: { rulesetId, text } }));
    expect(imported.character.rulesetId).toBe(rulesetId);
    expect(imported.report.program).toContain("PCGen");
  });

  test("adds an item, updates it, refusing a stale update, and removes it", async () => {
    const { character, characters, param } = await keyedCharacter();
    const item = await findPlainItem(character.rulesetId);
    const added = await expectOk(characters.inventory.$post({ json: { itemId: item.id, quantity: 1 }, param }));
    expect(added).toMatchObject({ item: { id: item.id }, quantity: 1 });

    const entry = { ...param, entryId: added.id };
    const updated = await expectOk(
      characters.inventory[":entryId"].$put({ json: { quantity: 3, updatedAt: added.updatedAt }, param: entry }),
    );
    expect(updated.quantity).toBe(3);
    await expectStatus(
      characters.inventory[":entryId"].$put({ json: { quantity: 4, updatedAt: added.updatedAt }, param: entry }),
      409,
    );
    const placement = await expectOk(
      characters.inventory.placement.$get({ param, query: { groups: "", location: "Head" } }),
    );
    expect(placement).toEqual({ warning: null });
    await expectStatus(characters.inventory[":entryId"].$delete({ param: entry }), 204);
    expect(await expectOk(characters.inventory.$get({ param }))).toEqual([]);
  });

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

  test("saves a plan's level, and removes the last", async () => {
    const ctx = await getSeedCtx();
    const { characters, param } = await keyedCharacter();
    const plan = levelUpPlan(
      [{ classId: ctx.classMap.pc!.Fighter!, hp: 10, level: 1 }],
      picks(ctx, FIGHTER_LEVELS[0]!),
    );

    const sheet = await expectOk(characters.levels.$post({ json: { force: true, steps: plan.steps }, param }));
    expect(JSON.stringify(sheet.sections)).toContain("Fighter");
    const removed = await expectOk(characters.levels.$delete({ param }));
    expect(JSON.stringify(removed.sections)).not.toContain("Fighter 1");
  });
});
