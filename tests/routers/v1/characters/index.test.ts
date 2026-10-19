import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { findSeededCharacter, NIL_UUID } from "@/tests/support/seed.ts";
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
});
