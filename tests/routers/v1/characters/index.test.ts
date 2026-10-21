import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { addCharacterLevel, findKlassLevel } from "@/tests/support/levels.ts";
import { findSeededCharacter, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** What the app's screens read, which v1 leaves out of every answer. */
const SCREEN_ONLY = ["createdAt", "updatedAt", "deletedAt", "privateNotes", "requirementTree", "sourceType"];

describe("v1 characters", () => {
  test("lists the key's user's characters, each named with its race and classes", async () => {
    const { api } = await createKeyedApi();
    const { items } = await expectOk(api.v1.characters.$get({ query: { search: "Fenn" } }));
    expect(items).toEqual([
      {
        classes: [{ level: 3, name: "Ranger" }],
        id: (await findSeededCharacter("Fenn Ashwalker")).id,
        level: 3,
        name: "Fenn Ashwalker",
        race: "Half-Elf",
      },
    ]);
  });

  test("answers a character's sheet, each thing it has named, without what only the app's screens read", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));

    expect(sheet).toMatchObject({
      id,
      level: 3,
      name: "Fenn Ashwalker",
      race: { name: "Half-Elf", size: "Medium", speed: 30 },
      ruleset: { name: "Core SRD 3.5" },
      valid: true,
      xp: 3000,
    });
    expect(sheet.classes).toEqual([expect.objectContaining({ hitDie: 8, level: 3, name: "Ranger" })]);
    expect(sheet.levels.map(({ class: klass, level }) => [level, klass.name, klass.level])).toEqual([
      [1, "Ranger", 1],
      [2, "Ranger", 2],
      [3, "Ranger", 3],
    ]);
    expect(sheet.abilities.map(({ abbreviation }) => abbreviation)).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    expect(sheet.feats).toContainEqual(
      expect.objectContaining({ level: 1, name: "Favored Enemy: Humanoid (Goblinoid)" }),
    );
    expect(sheet.feats.every(({ id: featId }) => typeof featId === "string")).toBe(true);
    expect(sheet.skills).toContainEqual({ name: "Hide", ranks: 6, total: 8, trained: true });

    const json = JSON.stringify(sheet);
    for (const key of SCREEN_ONLY) expect(json).not.toContain(`"${key}"`);
  });

  test("answers a skill's half ranks, a cross-class point's, in its ranks and its total", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const before = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));
    const disguise = before.skills.find(({ name }) => name === "Disguise");
    const { items } = await expectOk(
      api.v1.rulesets[":id"].skills.$get({ param: { id: before.ruleset.id }, query: { search: "Disguise" } }),
    );
    const klassLevel = await findKlassLevel(before.classes[0]!.id, 4);
    await addCharacterLevel(id, klassLevel!.id, { skills: [{ rank: 1, skillId: items[0]!.id }] });

    const { skills } = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));
    expect(skills.find(({ name }) => name === "Disguise")).toMatchObject({
      ranks: 0.5,
      total: (disguise?.total ?? 0) + 0.5,
    });
  });

  test("answers a bonded creature with its master's sheet", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Aldric Dawnbringer");
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));
    expect(sheet.bonded).toEqual([expect.objectContaining({ bond: "mount" })]);
  });

  test("refuses a character the key's user can't edit, as the app does", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    await expectStatus(api.v1.characters[":id"].$get({ param: { id } }), 404);
    await expectStatus(api.v1.characters[":id"].$get({ param: { id: NIL_UUID } }), 404);
  });

  test("answers what a character speaks, and what the languages it would pick leave it room for", async () => {
    const { api } = await createKeyedApi();
    const { langMap } = await getSeedCtx();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const route = api.v1.characters[":id"].languages;

    const languages = await expectOk(route.$get({ param: { id }, query: { languageIds: langMap.Goblin! } }));
    expect(languages.automatic.map(({ name }) => name)).toEqual(expect.arrayContaining(["Common", "Elven"]));
    expect(languages.picks).toEqual([{ id: langMap.Goblin, name: "Goblin", type: expect.any(String) }]);
    expect(languages.options.map(({ name }) => name)).not.toContain("Goblin");
  });

  test("answers how a new character of a ruleset scores its abilities, and the races it may be", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, raceMap, rulesetId } = await getSeedCtx();
    const creation = await expectOk(api.v1.characters.creation.$get({ query: { rulesetId } }));
    expect(creation.abilities).toContainEqual({ id: abilityMap.Strength, name: "Strength" });
    expect(creation.scores).toEqual({ max: 100, min: 1, start: 10 });
    expect(creation.modifiers).toContainEqual({ modifier: 2, score: 14 });
    expect(creation.methods).toContainEqual(
      expect.objectContaining({
        budget: 25,
        costs: expect.arrayContaining([{ cost: 8, score: 15 }]),
        kind: "pointBuy",
      }),
    );

    const query = { alignment: "Lawful Good", gender: "Male", rulesetId, search: "Dwarf" } as const;
    const { items } = await expectOk(api.v1.characters["available-races"].$get({ query }));
    expect(items).toContainEqual(
      expect.objectContaining({ eligible: true, id: raceMap.pc!.Dwarf, kind: "pc", speed: 20 }),
    );
  });

  test("creates a character of level 0, changes it, and archives it, unarchives it, and deletes it for good", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { abilityMap, langMap, raceMap, rulesetId } = await getSeedCtx();
    const json = {
      abilities: { [abilityMap.Intelligence!]: 14, [abilityMap.Strength!]: 16 },
      alignment: "Neutral Good",
      gender: "Female",
      name: "Ilsa Brandt",
      raceId: raceMap.pc!.Human!,
      rulesetId,
    } as const;

    const created = await expectOk(api.v1.characters.$post({ json }));
    expect(created).toMatchObject({ level: 0, name: "Ilsa Brandt", race: { name: "Human" }, xp: 0 });
    expect(created.abilities.find(({ name }) => name === "Strength")?.score).toBe(16);
    const { id } = created;
    const route = api.v1.characters[":id"];

    const changed = await expectOk(route.$put({ json: { deity: "Pelor", xp: 500 }, param: { id } }));
    expect(changed).toMatchObject({ identity: { deity: "Pelor" }, xp: 500 });
    const scores = { [abilityMap.Dexterity!]: 14 };
    expect((await expectOk(route.abilities.$put({ json: { scores }, param: { id } }))).abilities).toContainEqual(
      expect.objectContaining({ name: "Dexterity", score: 14 }),
    );
    const languageIds = [langMap.Elven!];
    const languages = await expectOk(route.languages.$put({ json: { languageIds }, param: { id } }));
    expect(languages.picks.map(({ name }) => name)).toEqual(["Elven"]);

    await expectStatus(route.$delete({ param: { id } }), 204);
    const archived = await expectOk(api.v1.characters.$get({ query: { visibility: "archived" } }));
    expect(archived.items.map((character) => character.id)).toEqual([id]);
    expect((await expectOk(route.unarchive.$post({ param: { id } }))).id).toBe(id);
    await expectStatus(route.$delete({ param: { id } }), 204);
    await expectStatus(route.permanent.$delete({ param: { id } }), 204);
    await expectStatus(route.unarchive.$post({ param: { id } }), 404);
  });

  test("refuses a new character of a race no player character is", async () => {
    const { api } = await createKeyedApi();
    const { raceMap, rulesetId } = await getSeedCtx();
    const json = {
      abilities: {},
      alignment: "Neutral Good",
      gender: "Male",
      name: "Wolf",
      raceId: raceMap.animalcompanion!.Wolf!,
      rulesetId,
    } as const;
    await expectStatus(api.v1.characters.$post({ json }), 400);
  });

  test("says what a character file is, and imports the character it holds with what it couldn't", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId } = await getSeedCtx();
    const text = await readPcgenFile("brannoc");

    const source = await expectOk(api.v1.characters.import.source.$post({ json: { text } }));
    expect(source).toEqual({
      baseRules: ["Dungeons & Dragons: 3.5"],
      refusal: null,
      source: { format: "2.0", program: "PCGen", rules: "35e", version: "6.09.08.RC1" },
    });

    const { character, report } = await expectOk(api.v1.characters.import.$post({ json: { rulesetId, text } }));
    expect(character).toMatchObject({ level: 8, name: "Brannoc Vale" });
    expect(report.imported).toContain("Name: Brannoc Vale");
    expect(report.unmatched).toContainEqual(expect.objectContaining({ line: 183, reason: expect.any(String) }));
  });
});
