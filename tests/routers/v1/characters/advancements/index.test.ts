import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterAdvancements } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { keyedCharacter, planFirstAdvancement } from "@/tests/support/v1.ts";

describe("v1 character advancements", () => {
  test("answers an advancement's steps, a plan's answer and a step's options, saving nothing", async () => {
    const { character, characters, param } = await keyedCharacter();

    const { steps } = await expectOk(characters.advancements.steps.$get({ param, query: {} }));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every(({ label, name }) => typeof label === "string" && typeof name === "string")).toBe(true);
    const planned = steps.find(({ mechanic }) => mechanic === "plan")!;

    const options = await expectOk(
      characters["advancement-plan"].options[":step"].$post({
        json: { plan: { steps: {} } },
        param: { ...param, step: planned.name },
        query: {},
      }),
    );
    expect(options).toMatchObject({ page: 1 });
    const track = options.items.find(({ eligible }) => eligible)!;

    const plan = { steps: { [planned.name]: [{ track: track.id }] } };
    const answer = await expectOk(characters["advancement-plan"].$post({ json: plan, param }));
    expect(answer.advancements).toEqual([
      { entryId: expect.any(String), position: 1, track: { id: track.id, name: track.name } },
    ]);
    // Each step the answer reads, by its mechanic
    for (const { mechanic, name } of steps) if (answer.steps[name]) expect(answer.steps[name]!.mechanic).toBe(mechanic);
    expect((await expectOk(characters.$get({ param }))).updatedAt).toBe(character.updatedAt);
  });

  test("takes a step's payload as the engine reads it: one in another step's shape refused, a key it doesn't take too", async () => {
    const { characters, param } = await keyedCharacter();
    const { steps } = await expectOk(characters.advancements.steps.$get({ param, query: {} }));
    const planned = steps.find(({ mechanic }) => mechanic === "plan")!;
    const options = await expectOk(
      characters["advancement-plan"].options[":step"].$post({
        json: { plan: { steps: {} } },
        param: { ...param, step: planned.name },
        query: {},
      }),
    );
    const track = options.items.find(({ eligible }) => eligible)!;

    const answerTo = (payload: unknown) =>
      characters["advancement-plan"].$post({ json: { steps: { [planned.name]: payload as never } }, param });
    // The engine's refusal, in its words, as the app's route answers it
    const refused = await expectStatus(answerTo([7]), 400);
    expect(await refused.json()).toMatchObject({ message: `The ${planned.name} step's answer isn't a plan step's` });
    // A key its shape doesn't take, refused by its place, as an entity body's field its kind hasn't is
    const noted = await expectStatus(answerTo([{ track: track.id, note: "x" }]), 400);
    expect(await noted.json()).toMatchObject({
      issues: [{ category: `steps.${planned.name}.0.note`, message: "Not a key of a plan step's answer" }],
    });
    expect((await expectOk(answerTo([{ track: track.id }]))).advancements).toHaveLength(1);
  });

  test("answers a saved advancement's plan, each step's payload as it saved it", async () => {
    const { api } = await createKeyedApi();
    const advanced: Record<string, string> = {};
    for (const { id } of (await expectOk(api.v1.characters.$get({ query: { limit: "50" } }))).items) {
      const [first] = await CharacterAdvancements.findMany(db, { characterId: id });
      if (first) advanced[id] = first.id;
    }
    const [id, advancementId] = Object.entries(advanced)[0]!;

    const saved = api.v1.characters[":id"].advancements[":advancementId"].plan;
    const plan = await expectOk(saved.$get({ param: { advancementId, id } }));
    expect(plan).toMatchObject({ editedAdvancementId: advancementId });
    expect(Object.keys(plan.steps).length).toBeGreaterThan(0);
  });

  test("saves a plan's advancement, and removes the last", async () => {
    const { api, character, characters, param } = await keyedCharacter();
    const { steps, track } = await planFirstAdvancement(api, character.id);

    const sheet = await expectOk(characters.advancements.$post({ json: { force: true, steps }, param }));
    expect(JSON.stringify(sheet.sections)).toContain(track.name);
    expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toHaveLength(1);
    await expectOk(characters.advancements.$delete({ param, query: {} }));
    expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toHaveLength(0);
  });

  test("refuses a save or a removal sent with a last advancement the character has moved past", async () => {
    const { api, character, characters, param } = await keyedCharacter();
    const { steps } = await planFirstAdvancement(api, character.id);
    const read = await expectOk(characters.$get({ param }));
    expect(read.lastAdvancementId).toBeNull();

    // The same save sent twice adds one advancement
    const json = { force: true, lastAdvancementId: read.lastAdvancementId, steps };
    const saved = await expectOk(characters.advancements.$post({ json, param }));
    await expectStatus(characters.advancements.$post({ json, param }), 409);
    expect(await CharacterAdvancements.findMany(db, { characterId: character.id })).toHaveLength(1);

    // Two removals of the advancement read as the last take it once
    const query = { advancementId: saved.lastAdvancementId! };
    await expectOk(characters.advancements.$delete({ param, query }));
    await expectStatus(characters.advancements.$delete({ param, query }), 409);
  });
});
