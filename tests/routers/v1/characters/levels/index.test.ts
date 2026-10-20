import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { findSeededCharacter, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/**
 * A seeded fighter's next level, as a caller plans it from its choices: each feat slot filled with the first feats that
 * qualify, and its skill points spent on its class skills, each as far as its ranks may go.
 */
async function planFighterLevel() {
  const { api } = await createKeyedApi();
  const { id } = await findSeededCharacter("Bjorn Ironhand");
  const route = api.v1.characters[":id"];
  const { classes } = await expectOk(route["level-choices"].$get({ param: { id }, query: {} }));
  const classId = classes.find(({ name }) => name === "Fighter")!.id;
  const { level } = await expectOk(route["level-choices"].$get({ param: { id }, query: { classId } }));
  if (!level) throw new Error("The fighter has no next level");
  const picked = new Set<string>();
  const feats = level.feats.slots.flatMap(({ aptitude, count, options }) =>
    options
      .filter((option) => !picked.has(option.id))
      .slice(0, count)
      .map((option) => {
        picked.add(option.id);
        return { aptitudeId: aptitude.id, featId: option.id };
      }),
  );
  // Each class skill takes the points it has room for, until the level's are spent
  let left = level.skills.points;
  const skillPoints: Record<string, number> = {};
  for (const skill of level.skills.skills.filter(({ classSkill }) => classSkill)) {
    const points = Math.min(left, Math.floor((skill.maxRanks - skill.ranks) / skill.ranksPerPoint));
    if (points > 0) skillPoints[skill.id] = points;
    left -= points;
  }
  const json = { classId, feats, hitPoints: 7, level: level.class.level, skillPoints };
  return { id, json, route };
}

describe("v1 character levels", () => {
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

  test("saves a character's next level whole, as its choices offer it, and answers its sheet", async () => {
    const { id, json, route } = await planFighterLevel();
    const sheet = await expectOk(route.levels.$post({ json, param: { id } }));
    expect(sheet.level).toBe(6);
    expect(sheet.classes).toContainEqual(expect.objectContaining({ level: 6, name: "Fighter" }));
    const saved = sheet.levels.at(-1)!;
    expect(saved).toMatchObject({ class: { level: 6, name: "Fighter" }, hitPoints: 7, level: 6 });

    const level = await expectOk(route.levels[":levelId"].$get({ param: { id, levelId: saved.id } }));
    expect(level.feats.map(({ featId }) => featId).sort()).toEqual(json.feats.map(({ featId }) => featId).sort());
    expect(level.skillPoints).toEqual(json.skillPoints);
  });

  test("refuses a level whose picks the rules refuse, unless it's forced", async () => {
    const { id, json, route } = await planFighterLevel();
    // The level's feat slots left empty
    const unpicked = { ...json, feats: [] };
    await expectStatus(route.levels.$post({ json: unpicked, param: { id } }), 400);
    expect((await expectOk(route.levels.$post({ json: { ...unpicked, force: true }, param: { id } }))).level).toBe(6);
  });

  test("changes a level a character took, and removes its latest level", async () => {
    const { id, json, route } = await planFighterLevel();
    const { levels } = await expectOk(route.levels.$post({ json, param: { id } }));
    const levelId = levels.at(-1)!.id;

    const { classId: _classId, level: _level, ...picks } = json;
    const changed = await expectOk(
      route.levels[":levelId"].$put({ json: { ...picks, hitPoints: 9 }, param: { id, levelId } }),
    );
    expect(changed).toMatchObject({ hitPoints: 9, id: levelId });

    await expectStatus(route.levels.latest.$delete({ param: { id } }), 204);
    expect((await expectOk(route.$get({ param: { id } }))).level).toBe(5);
    await expectStatus(route.levels[":levelId"].$get({ param: { id, levelId } }), 404);
  });

  test("changes only what an edit of a level names: its picks are kept", async () => {
    const { id, json, route } = await planFighterLevel();
    const { levels } = await expectOk(route.levels.$post({ json, param: { id } }));
    const levelId = levels.at(-1)!.id;
    const before = await expectOk(route.levels[":levelId"].$get({ param: { id, levelId } }));

    const changed = await expectOk(route.levels[":levelId"].$put({ json: { hitPoints: 9 }, param: { id, levelId } }));
    expect(changed).toEqual({ ...before, hitPoints: 9 });
  });

  test("refuses another user's character", async () => {
    const { id, json } = await planFighterLevel();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    const route = api.v1.characters[":id"];
    await expectStatus(route.levels.$post({ json, param: { id } }), 404);
    await expectStatus(route.levels.latest.$delete({ param: { id } }), 404);
    await expectStatus(route.levels[":levelId"].$get({ param: { id, levelId: NIL_UUID } }), 404);
  });
});
