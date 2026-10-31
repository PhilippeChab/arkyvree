import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Characters } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { carry, findPlainItem } from "@/tests/support/dnd3.5/items.ts";
import { FIGHTER_LEVELS, picks } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import { findSeededCharacter, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("v1 characters", () => {
  test("lists the key's user's characters, each as its card shows it", async () => {
    const { api } = await createKeyedApi();
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    const { items, nextPage, page } = await expectOk(api.v1.characters.$get({ query: { search: "Bjorn" } }));

    expect({ nextPage, page }).toEqual({ nextPage: null, page: 1 });
    expect(items).toEqual([
      {
        accessRole: "owner",
        description: bjorn.description,
        id: bjorn.id,
        name: "Bjorn Ironhand",
        summary: expect.arrayContaining([expect.objectContaining({ partial: false })]),
      },
    ]);
  });

  test("answers a character's sheet: its sections, what the rules find wrong, what the user may do", async () => {
    const { api } = await createKeyedApi();
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param: { id: bjorn.id } }));

    expect(sheet).toMatchObject({
      archived: false,
      id: bjorn.id,
      name: "Bjorn Ironhand",
      parentCharacterId: null,
      permissions: { canEdit: true },
      rulesetId: bjorn.rulesetId,
      validation: { valid: expect.any(Boolean) },
    });
    expect(sheet.sections.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(["fields", "scores", "stats", "table", "entries", "inventory"]),
    );
  });

  test("answers a character's inventory, its items' fields by name, and its own modifiers", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const character = await createTestCharacter(user.id);
    const item = await findPlainItem(character.rulesetId);
    await carry(character, [{ item: item.id, quantity: 2 }]);

    const inventory = await expectOk(api.v1.characters[":id"].inventory.$get({ param: { id: character.id } }));
    expect(inventory).toEqual([
      expect.objectContaining({
        charges: null,
        item: expect.objectContaining({ id: item.id, name: item.name }),
        quantity: 2,
      }),
    ]);
    expect(await expectOk(api.v1.characters[":id"].modifiers.$get({ param: { id: character.id } }))).toEqual([]);
  });

  test("answers a character's links of a role: the room the picks being made leave", async () => {
    const { api } = await createKeyedApi();
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    const param = { id: bjorn.id, role: "speaks" };

    const room = await expectOk(api.v1.characters[":id"].links[":role"].$get({ param, query: {} }));
    expect(room.picks).toEqual([]);
    expect(room.automatic.length).toBeGreaterThan(0);
    expect(room.options.length).toBeGreaterThan(0);
    const [option] = room.options;
    const picked = await expectOk(
      api.v1.characters[":id"].links[":role"].$get({ param, query: { entityIds: option!.id } }),
    );
    expect(picked.picks).toEqual([option]);
    await expectStatus(
      api.v1.characters[":id"].links[":role"].$get({ param: { ...param, role: "nothing" }, query: {} }),
      404,
    );
  });

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

  test("refuses a character the user can't read, and an archived one's edits' reads", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    await expectStatus(api.v1.characters[":id"].$get({ param: { id: bjorn.id } }), 404);
    await expectStatus(api.v1.characters[":id"].$get({ param: { id: NIL_UUID } }), 404);

    const archived = await createTestCharacter(user.id);
    await Characters.archive(db, { id: archived.id });
    const param = { id: archived.id };
    await expectOk(api.v1.characters[":id"].$get({ param }));
    await expectOk(api.v1.characters[":id"].inventory.$get({ param }));
    await expectStatus(api.v1.characters[":id"].modifiers.$get({ param }), 404);
  });
});
