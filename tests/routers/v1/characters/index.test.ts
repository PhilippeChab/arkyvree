import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Characters } from "@/server/repositories/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFormCharacter, findBaseRuleset, findCharacter, listEntities } from "@/tests/support/v1.ts";

/** A new user's key, and a character of theirs made as its base rules' form lays it out. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createFormCharacter(user.id, (await findBaseRuleset(api)).id);
  return { api, character, param: { id: character.id }, userId: user.id };
}

describe("v1 characters", () => {
  test("lists the key's user's characters, each as its card shows it", async () => {
    const { api } = await createKeyedApi();
    const card = await findCharacter(api);
    const { items, nextPage, page } = await expectOk(api.v1.characters.$get({ query: { search: card.name } }));

    expect({ nextPage, page }).toEqual({ nextPage: null, page: 1 });
    expect(items).toContainEqual({
      accessRole: "owner",
      description: card.description,
      id: card.id,
      name: card.name,
      summary: expect.any(Array),
    });
  });

  test("answers a character's sheet: its sections, what the rules find wrong, what the user may do", async () => {
    const { api, character, param } = await keyedCharacter();
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param }));

    expect(sheet).toMatchObject({
      archived: false,
      id: character.id,
      name: character.name,
      parentCharacterId: null,
      permissions: { canEdit: true },
      rulesetId: character.rulesetId,
      validation: { valid: expect.any(Boolean) },
    });
    expect(sheet.sections.length).toBeGreaterThan(0);
    expect(sheet.sections.every(({ key, title }) => typeof key === "string" && typeof title === "string")).toBe(true);
  });

  test("answers a character's inventory, its items by the kind its sheet carries, and its own modifiers", async () => {
    const { api, character, param, userId } = await keyedCharacter();
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param }));
    const carried = sheet.sections.find(({ kind }) => kind === "inventory")?.entityType as string;
    const [item] = await listEntities(api, character.rulesetId, carried, { limit: "1" });
    await CharacterInventoryService.addItem({ userId }, character.id, item!.id, 2, null, null, null, [], true);

    const inventory = await expectOk(api.v1.characters[":id"].inventory.$get({ param }));
    expect(inventory).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ id: item!.id, name: item!.name }),
        quantity: 2,
      }),
    ]);
    expect(await expectOk(api.v1.characters[":id"].modifiers.$get({ param }))).toEqual([]);
  });

  test("answers a character's links of a role its sheet names: the room the picks being made leave", async () => {
    const { api } = await createKeyedApi();
    const links = api.v1.characters[":id"].links[":role"];
    // A seeded character's role its sheet names, with room left to pick in
    const rooms = [];
    for (const { id } of (await expectOk(api.v1.characters.$get({ query: { limit: "50" } }))).items) {
      const sheet = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));
      for (const { role } of sheet.sections.flatMap(({ links }) => (links as { role: string }[] | undefined) ?? []))
        rooms.push({ param: { id }, role, room: await expectOk(links.$get({ param: { id, role }, query: {} })) });
    }
    const { param, role, room } = rooms.find(({ room }) => room.options.length > 0)!;

    expect(room.picks).toEqual([]);
    expect(Array.isArray(room.automatic)).toBe(true);
    const [option] = room.options;
    const picked = await expectOk(links.$get({ param: { ...param, role }, query: { entityIds: option!.id } }));
    expect(picked.picks).toEqual([option]);
    await expectStatus(links.$get({ param: { ...param, role: "nothing" }, query: {} }), 404);
  });

  test("answers a level's steps, a plan's answer and a step's options, saving nothing", async () => {
    const { api, character, param } = await keyedCharacter();
    const levels = api.v1.characters[":id"];

    const { steps } = await expectOk(levels.levels.steps.$get({ param, query: {} }));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every(({ label, name }) => typeof label === "string" && typeof name === "string")).toBe(true);
    const planned = steps.find(({ mechanic }) => mechanic === "plan")!;

    const options = await expectOk(
      levels["level-plan"].options[":step"].$post({
        json: { plan: { steps: {} } },
        param: { ...param, step: planned.name },
        query: {},
      }),
    );
    expect(options).toMatchObject({ page: 1 });
    const track = options.items.find(({ eligible }) => eligible)!;

    const plan = { steps: { [planned.name]: [{ position: 1, track: track.id }] } };
    const answer = await expectOk(levels["level-plan"].$post({ json: plan, param }));
    expect(answer.advancements).toEqual([
      { id: expect.any(String), position: 1, track: { id: track.id, name: track.name } },
    ]);
    // Each step the answer reads, by its mechanic
    for (const { mechanic, name } of steps) if (answer.steps[name]) expect(answer.steps[name]!.mechanic).toBe(mechanic);
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param }));
    expect(sheet.updatedAt).toBe(character.updatedAt);
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

  test("refuses a character the user can't read, and an archived one's edits' reads", async () => {
    const { api, userId } = await keyedCharacter();
    const other = await findCharacter((await createKeyedApi()).api);
    await expectStatus(api.v1.characters[":id"].$get({ param: { id: other.id } }), 404);
    await expectStatus(api.v1.characters[":id"].$get({ param: { id: NIL_UUID } }), 404);

    const archived = await createFormCharacter(userId, (await findBaseRuleset(api)).id);
    await Characters.archive(db, { id: archived.id });
    const param = { id: archived.id };
    await expectOk(api.v1.characters[":id"].$get({ param }));
    await expectOk(api.v1.characters[":id"].inventory.$get({ param }));
    await expectStatus(api.v1.characters[":id"].modifiers.$get({ param }), 404);
  });
});
