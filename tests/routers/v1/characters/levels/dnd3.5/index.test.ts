import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterAdvancements } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { FIGHTER_LEVELS, picks } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a character of theirs. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createTestCharacter(user.id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id } };
}

describe("v1 character levels", () => {
  test("answers a level's steps, a plan's answer and a step's options, saving nothing", async () => {
    const ctx = await getSeedCtx();
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const character = await createTestCharacter(user.id);
    const levels = api.v1.characters[":id"];
    const param = { id: character.id };

    const { steps } = await expectOk(levels.levels.steps.$get({ param, query: {} }));
    expect(steps.map(({ name }) => name)).toEqual(["class-plan", "hp", "abilities", "skills", "feats", "spells"]);
    expect(steps[0]).toEqual({ kind: "classes", label: expect.any(String), mechanic: "plan", name: "class-plan" });

    const plan = levelUpPlan(
      [{ classId: ctx.classMap.pc!.Fighter!, hp: 10, level: 1 }],
      picks(ctx, FIGHTER_LEVELS[0]!),
    );
    const answer = await expectOk(levels["level-plan"].$post({ json: plan, param }));
    expect(answer.advancements).toEqual([
      { id: expect.any(String), position: 1, track: { id: ctx.classMap.pc!.Fighter!, name: "Fighter" } },
    ]);
    expect(answer.steps.skills).toMatchObject({ mechanic: "spend" });

    const options = await expectOk(
      levels["level-plan"].options[":step"].$post({
        json: { plan: { steps: {} } },
        param: { ...param, step: "class-plan" },
        query: {},
      }),
    );
    expect(options).toMatchObject({ grouped: false, page: 1 });
    expect(options.items).toContainEqual(expect.objectContaining({ eligible: true, name: "Fighter" }));
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param }));
    expect(sheet.updatedAt).toBe(character.updatedAt);
  });

  test("answers a saved level's plan, each step's payload as it saved it", async () => {
    const { api } = await createKeyedApi();
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    const [first] = await CharacterAdvancements.findMany(db, { characterId: bjorn.id });
    const param = { advancementId: first!.id, id: bjorn.id };
    const plan = await expectOk(api.v1.characters[":id"].levels[":advancementId"].plan.$get({ param }));
    expect(plan).toMatchObject({ editedLevelId: first!.id, steps: { hp: [expect.any(Number)] } });
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
