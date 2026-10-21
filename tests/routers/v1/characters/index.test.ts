import { describe, expect, test } from "bun:test";

import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
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

  test("answers a character's inventory: each item it carries, where, and how many", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const inventory = await expectOk(api.v1.characters[":id"].inventory.$get({ param: { id } }));
    expect(inventory).toContainEqual({
      charges: null,
      equipped: true,
      id: expect.any(String),
      item: { id: expect.any(String), name: "Longbow", slot: "Other", type: "Weapon", weight: 3 },
      location: "Two Handed",
      locationLabel: "Two Handed (Set 1)",
      quantity: 1,
      weaponSets: [0],
    });
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

  test("answers a level a character took, its picks as a save sends them back", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const { levels } = await expectOk(api.v1.characters[":id"].$get({ param: { id } }));
    const levelId = levels[0]!.id;

    const level = await expectOk(api.v1.characters[":id"].levels[":levelId"].$get({ param: { id, levelId } }));
    expect(level).toMatchObject({
      class: { level: 1, name: "Ranger" },
      hitDie: 8,
      hitPoints: 8,
      hitPointsRange: { max: 8, min: 1 },
      id: levelId,
    });
    expect(level.feats.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["Favored Enemy: Humanoid (Goblinoid)", "Point Blank Shot"]),
    );
    expect(Object.values(level.skillPoints)).toContain(4);
    expect(level.spells).toEqual([]);
    await expectStatus(api.v1.characters[":id"].levels[":levelId"].$get({ param: { id, levelId: NIL_UUID } }), 404);
  });

  test("answers a character's own modifiers, each target named", async () => {
    const { user, session } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createTestCharacter(user.id);
    await CharacterModifiersService.createModifier(session, id, {
      operator: "add",
      target: "abilities.strength.misc",
      value: "2",
    });
    expect(await expectOk(api.v1.characters[":id"].modifiers.$get({ param: { id } }))).toEqual([
      expect.objectContaining({
        operator: "add",
        target: "abilities.strength.misc",
        targetLabels: ["Abilities", "Strength", "Misc"],
        value: "2",
      }),
    ]);
  });
});
