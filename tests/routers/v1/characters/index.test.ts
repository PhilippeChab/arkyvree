import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFormCharacter, findBaseRuleset, findCharacter, readRulesOf } from "@/tests/support/v1.ts";

/** An item of a new character's form's `fields` section, as the rules lay it out. */
interface FormItem {
  key?: string;
  kind: string;
  min?: number;
  options?: (number | string)[];
  required?: string;
  start?: number;
}

/** A new user's key, and a character of theirs made as its base rules' form lays it out. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createFormCharacter(user.id, (await findBaseRuleset(api)).id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id }, userId: user.id };
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
    const { character, characters, param } = await keyedCharacter();
    const sheet = await expectOk(characters.$get({ param }));

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

  test("refuses a character the user can't read, and an archived one's edits' reads", async () => {
    const { api, characters, userId } = await keyedCharacter();
    const other = await findCharacter((await createKeyedApi()).api);
    await expectStatus(characters.$get({ param: { id: other.id } }), 404);
    await expectStatus(characters.$get({ param: { id: NIL_UUID } }), 404);

    const archived = await createFormCharacter(userId, (await findBaseRuleset(api)).id);
    await Characters.archive(db, { id: archived.id });
    const param = { id: archived.id };
    await expectOk(characters.$get({ param }));
    await expectOk(characters.inventory.$get({ param }));
    await expectStatus(characters.modifiers.$get({ param }), 404);
  });

  test("creates a character as the rules' form lays it out, from its creation's reads, answering its sheet", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id: rulesetId } = await findBaseRuleset(api);
    const { sections } = (await readRulesOf(api, rulesetId)).characterForm;
    const items = sections.flatMap((section) =>
      section.kind === "fields" ? (section.lines as { key?: string; kind: string; role?: string }[][]).flat() : [],
    );

    // Each field the form requires its start or first option, each pick its first eligible option over those fields,
    // each score its start
    const fields: Record<string, number | string> = {};
    for (const { key, kind, min, options, required, start } of items as FormItem[]) {
      if (!key || !required) continue;
      if (kind === "number") fields[key] = start ?? min ?? 1;
      else if (options?.[0] !== undefined) fields[key] = options[0];
      else fields[key] = "Test";
    }
    const narrowing = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]));
    const picks: Record<string, string> = {};
    for (const { role } of items.filter(({ kind }) => kind === "pick")) {
      const query = { ...narrowing, rulesetId };
      const options = await expectOk(api.v1.characters.creation[":role"].$get({ param: { role: role! }, query }));
      picks[role!] = options.items.find(({ eligible }) => eligible)!.id;
    }
    const scores: Record<string, Record<string, number>> = {};
    const scored = sections.filter(({ kind }) => kind === "scores").map(({ role }) => role as string);
    for (const role of scored) {
      const creation = await expectOk(api.v1.characters.creation.$get({ query: { role, rulesetId } }));
      scores[role] = Object.fromEntries(creation.entities.map(({ id }) => [id, creation.scores.start]));
    }

    const json = { fields, name: "Keyed Hero", picks, rulesetId, scores };
    const sheet = await expectOk(api.v1.characters.$post({ json }));
    expect(sheet).toMatchObject({ archived: false, name: "Keyed Hero", rulesetId });

    const role = scored[0]!;
    const raised = Object.fromEntries(Object.keys(scores[role]!).map((id) => [id, scores[role]![id]! + 1]));
    await expectOk(api.v1.characters[":id"].scores[":role"].$put({ json: raised, param: { id: sheet.id, role } }));
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

  test("refuses to import a file no importer of the ruleset's rules reads", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id: rulesetId } = await findBaseRuleset(api);
    const text = "Not a character file";
    await expectStatus(api.v1.characters.import.$post({ json: { rulesetId, text } }), 422);
  });
});
