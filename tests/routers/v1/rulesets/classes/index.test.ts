import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
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

  test("answers a class's levels, each with its saves and the feats it grants", async () => {
    const { classId, id, route } = await openWizard();
    const levels = await expectOk(route.levels.$get({ param: { classId, id } }));
    expect(levels.map(({ level }) => level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    const [first] = levels;
    expect(first?.fields).toEqual({ bab: 0, skills: 2 });
    expect(first?.feats).toContainEqual(
      expect.objectContaining({
        aptitude: expect.objectContaining({ name: "Wizard Class Feature" }),
        name: "Scribe Scroll",
      }),
    );
    expect(first?.saves).toHaveLength(3);

    const levelId = first!.id;
    expect(await expectOk(route.levels[":levelId"].$get({ param: { classId, id, levelId } }))).toEqual(first);
    await expectStatus(route.levels[":levelId"].$get({ param: { classId, id, levelId: NIL_UUID } }), 404);
  });

  test("answers a class's skills, spell lists, spells a day and known, and the feats its levels give to pick", async () => {
    const { classId, id, route } = await openWizard();
    const param = { classId, id };

    expect((await expectOk(route.skills.$get({ param }))).map(({ name }) => name)).toContain("Concentration");
    expect(await expectOk(route["spell-lists"].$get({ param }))).toEqual([
      expect.objectContaining({ name: "Wizard Spells" }),
    ]);
    const [perDay] = await expectOk(route["spells-per-day"].$get({ param }));
    expect(perDay).toEqual({
      level: 1,
      spells: [
        { count: 3, spellLevel: 0 },
        { count: 1, spellLevel: 1 },
      ],
    });
    expect(await expectOk(route["spells-known"].$get({ param }))).toEqual(expect.any(Array));
    const [pools] = await expectOk(route["feat-pools"].$get({ param }));
    expect(pools?.level).toBe(1);
    expect(pools?.aptitudes).toContainEqual({ count: 1, name: "Familiar Bond" });
  });
});
