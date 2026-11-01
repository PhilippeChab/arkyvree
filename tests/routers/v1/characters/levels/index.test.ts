import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterAdvancements } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFormCharacter, findBaseRuleset, planFirstLevel } from "@/tests/support/v1.ts";

/** A new user's key, and a character of theirs made as its base rules' form lays it out. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createFormCharacter(user.id, (await findBaseRuleset(api)).id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id } };
}

describe("v1 character levels", () => {
  test("answers a level's steps, a plan's answer and a step's options, saving nothing", async () => {
    const { character, characters, param } = await keyedCharacter();

    const { steps } = await expectOk(characters.levels.steps.$get({ param, query: {} }));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every(({ label, name }) => typeof label === "string" && typeof name === "string")).toBe(true);
    const planned = steps.find(({ mechanic }) => mechanic === "plan")!;

    const options = await expectOk(
      characters["level-plan"].options[":step"].$post({
        json: { plan: { steps: {} } },
        param: { ...param, step: planned.name },
        query: {},
      }),
    );
    expect(options).toMatchObject({ page: 1 });
    const track = options.items.find(({ eligible }) => eligible)!;

    const plan = { steps: { [planned.name]: [{ track: track.id }] } };
    const answer = await expectOk(characters["level-plan"].$post({ json: plan, param }));
    expect(answer.advancements).toEqual([
      { id: expect.any(String), position: 1, track: { id: track.id, name: track.name } },
    ]);
    // Each step the answer reads, by its mechanic
    for (const { mechanic, name } of steps) if (answer.steps[name]) expect(answer.steps[name]!.mechanic).toBe(mechanic);
    expect((await expectOk(characters.$get({ param }))).updatedAt).toBe(character.updatedAt);
  });

  test("answers a saved level's plan, each step's payload as it saved it", async () => {
    const { api } = await createKeyedApi();
    const advanced: Record<string, string> = {};
    for (const { id } of (await expectOk(api.v1.characters.$get({ query: { limit: "50" } }))).items) {
      const [first] = await CharacterAdvancements.findMany(db, { characterId: id });
      if (first) advanced[id] = first.id;
    }
    const [id, advancementId] = Object.entries(advanced)[0]!;

    const saved = api.v1.characters[":id"].levels[":advancementId"].plan;
    const plan = await expectOk(saved.$get({ param: { advancementId, id } }));
    expect(plan).toMatchObject({ editedLevelId: advancementId });
    expect(Object.keys(plan.steps).length).toBeGreaterThan(0);
  });

  test("saves a plan's level, and removes the last", async () => {
    const { api, character, characters, param } = await keyedCharacter();
    const { steps, track } = await planFirstLevel(api, character.id);

    const sheet = await expectOk(characters.levels.$post({ json: { force: true, steps }, param }));
    expect(JSON.stringify(sheet.sections)).toContain(track.name);
    expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toHaveLength(1);
    await expectOk(characters.levels.$delete({ param }));
    expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toHaveLength(0);
  });
});
