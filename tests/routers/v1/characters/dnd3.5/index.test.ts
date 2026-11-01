import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { findSeededCharacter, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { CHARACTER_ALIGNMENT, CHARACTER_GENDER, CHARACTER_XP } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A new user's key, and a character of theirs. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createTestCharacter(user.id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id } };
}

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
});
