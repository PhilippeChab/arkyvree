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
});
