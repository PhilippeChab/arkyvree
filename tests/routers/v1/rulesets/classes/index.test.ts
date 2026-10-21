import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** The seeded core rules' wizard: its ruleset, its id, and the routes under it. */
async function openWizard() {
  const { api } = await createKeyedApi();
  const { klassMap, rulesetId: id } = await getSeedCtx();
  const classId = klassMap.pc!.Wizard!;
  return { classId, id, route: api.v1.rulesets[":id"].classes[":classId"] };
}

describe("v1 ruleset classes", () => {
  test("lists classes of a kind, and answers one with its hit die and fields", async () => {
    const { api } = await createKeyedApi();
    const { klassMap, rulesetId: id } = await getSeedCtx();
    const classes = api.v1.rulesets[":id"].classes;

    const { items } = await expectOk(classes.$get({ param: { id }, query: { kind: "pc", search: "Fighter" } }));
    expect(items).toContainEqual(expect.objectContaining({ hitDie: 10, kind: "pc", name: "Fighter" }));

    const wizard = await expectOk(classes[":classId"].$get({ param: { classId: klassMap.pc!.Wizard!, id } }));
    expect(wizard).toMatchObject({ hitDie: 4, kind: "pc", name: "Wizard", parentId: null });
    expect(wizard.fields).toMatchObject({ casterType: "Arcane" });
    await expectStatus(classes[":classId"].$get({ param: { classId: NIL_UUID, id } }), 404);
  });

  test("answers a class's whole progression: its levels, its pools' picks and its spell tables", async () => {
    const { classId, id, route } = await openWizard();
    const progression = await expectOk(route.progression.$get({ param: { classId, id } }));
    const { levels } = progression;
    expect(levels.map(({ level }) => level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    const [first] = levels;
    expect(first?.fields).toEqual({ bab: 0, skills: 2 });
    expect(first?.feats).toContainEqual(
      expect.objectContaining({ aptitudeId: expect.any(String), featId: expect.any(String), name: "Scribe Scroll" }),
    );
    expect(first?.saves).toHaveLength(3);
    expect(progression.spellList).toMatchObject({ name: "Wizard Spells" });
    expect(progression.spells.perDay[0]).toEqual({ counts: [3, 1, ...Array(8).fill(null)], levelId: first!.id });

    // A wizard prepares its spells: a sorcerer knows them
    const sorcererId = (await getSeedCtx()).klassMap.pc!.Sorcerer!;
    const sorcerer = await expectOk(route.progression.$get({ param: { classId: sorcererId, id } }));
    expect(sorcerer.spells.known[0]?.counts.slice(0, 3)).toEqual([4, 2, null]);
    await expectStatus(route.progression.$get({ param: { classId: NIL_UUID, id } }), 404);
  });

  test("answers a class's skills and spell lists", async () => {
    const { classId, id, route } = await openWizard();
    const param = { classId, id };

    expect((await expectOk(route.skills.$get({ param }))).map(({ name }) => name)).toContain("Concentration");
    expect(await expectOk(route["spell-lists"].$get({ param }))).toEqual([
      expect.objectContaining({ name: "Wizard Spells" }),
    ]);
  });

  test("adds a class to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { klassMap } = await getSeedCtx();
    const classes = api.v1.rulesets[":id"].classes;

    const created = await expectOk(
      classes.$post({ json: { fields: { casterType: "Divine" }, hitDie: 8, name: "Warden" }, param: { id } }),
    );
    expect(created).toMatchObject({ fields: { casterType: "Divine" }, hitDie: 8, kind: "pc", name: "Warden" });

    const classId = klassMap.pc!.Fighter!;
    const changed = await expectOk(
      classes[":classId"].$put({ json: { hitDie: 12, name: "Warrior" }, param: { classId, id } }),
    );
    expect(changed).toMatchObject({ hitDie: 12, name: "Warrior" });
    expect(changed.id).not.toBe(classId);
    const unchanged = await expectOk(
      classes[":classId"].$put({ json: { hitDie: 0, name: "Warrior" }, param: { classId: changed.id, id } }),
    );
    expect(unchanged.hitDie).toBe(12);

    await expectStatus(classes[":classId"].$delete({ param: { classId: created.id, id } }), 204);
    await expectStatus(classes[":classId"].$get({ param: { classId: created.id, id } }), 404);
  });

  test("adds a level to a class, changes it and deletes it, and makes a skill one of its own and not", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { featMap, aptMap, saveMap, skillMap } = await getSeedCtx();
    const classes = api.v1.rulesets[":id"].classes;
    const { id: classId } = await expectOk(classes.$post({ json: { hitDie: 8, name: "Warden" }, param: { id } }));
    const route = classes[":classId"];

    const feats = [{ aptitudeId: aptMap.General!, featId: featMap.Alertness!, free: true }];
    const saves = [{ base: 2, saveId: saveMap.Fortitude! }];
    const json = { feats, fields: { bab: 1, skills: 4 }, level: 1, saves };
    const level = await expectOk(route.levels.$post({ json, param: { classId, id } }));
    expect(level).toMatchObject({
      feats: [{ ...feats[0], name: "Alertness" }],
      fields: { bab: 1, skills: 4 },
      level: 1,
      saves,
    });

    const levelId = level.id;
    const progression = route.progression;
    expect((await expectOk(progression.$get({ param: { classId, id } }))).levels).toEqual([level]);
    await expectStatus(route.levels[":levelId"].$delete({ param: { classId, id, levelId } }), 204);
    expect((await expectOk(progression.$get({ param: { classId, id } }))).levels).toEqual([]);

    const skillId = skillMap.Climb!;
    expect(await expectOk(route.skills.$post({ json: { skillId }, param: { classId, id } }))).toEqual([
      { id: skillId, name: "Climb" },
    ]);
    await expectStatus(route.skills[":skillId"].$delete({ param: { classId, id, skillId } }), 204);
    expect(await expectOk(route.skills.$get({ param: { classId, id } }))).toEqual([]);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    await expectStatus(api.v1.rulesets[":id"].classes.$post({ json: { name: "Warden" }, param: { id } }), 403);
  });

  test("answers a class's own pools and its spell list in its progression", async () => {
    const { classId, id, route } = await openWizard();
    const { aptMap } = await getSeedCtx();
    const progression = await expectOk(route.progression.$get({ param: { classId, id } }));
    expect(progression.spellList).toEqual({ id: aptMap["Wizard Spells"], name: "Wizard Spells" });
    expect(progression.severalSpellLists).toBe(false);
    expect(progression.pools).toContainEqual({
      aptitudeId: aptMap["Wizard Specialization"],
      name: "Wizard Specialization",
      picks: [{ count: 1, levelId: expect.any(String) }],
    });
  });

  test("saves a class's progression as its read answers it, on a copy of its own when it's inherited", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { aptMap, klassMap } = await getSeedCtx();
    const classId = klassMap.pc!.Wizard!;
    const route = api.v1.rulesets[":id"].classes[":classId"];
    const read = await expectOk(route.progression.$get({ param: { classId, id } }));
    const [first, second] = read.levels;
    const aptitudeId = aptMap["Wizard Specialization"]!;

    // The read sent back, a level and a pool changed
    const json = {
      levels: [{ ...second!, fields: { ...second!.fields, bab: 1 } }],
      pools: [{ aptitudeId, picks: [{ count: 2, levelId: first!.id }] }],
      spells: read.spells,
    };
    const saved = await expectOk(route.progression.$put({ json, param: { classId, id } }));
    expect(saved.levels[1]?.fields).toMatchObject({ bab: 1 });
    expect(saved.levels[1]?.id).not.toBe(second!.id);
    expect(saved.spells.perDay.map(({ counts }) => counts)).toEqual(read.spells.perDay.map(({ counts }) => counts));
    expect(saved.pools.find((pool) => pool.aptitudeId === aptitudeId)?.picks).toEqual([
      { count: 2, levelId: saved.levels[0]!.id },
    ]);
    expect(await expectOk(route.progression.$get({ param: { classId, id } }))).toEqual(saved);
  });
});
