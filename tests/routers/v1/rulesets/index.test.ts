import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 rulesets", () => {
  test("lists rulesets, and answers one, without the database's timestamps", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId } = await getSeedCtx();
    const { items } = await expectOk(api.v1.rulesets.$get({ query: { scope: "base", search: "Core SRD" } }));
    expect(items.map(({ id }) => id)).toContain(rulesetId);

    const ruleset = await expectOk(api.v1.rulesets[":id"].$get({ param: { id: rulesetId } }));
    expect(ruleset).toMatchObject({
      id: rulesetId,
      kind: "ruleset",
      name: "Core SRD 3.5",
      parentId: null,
      system: true,
    });
    expect(ruleset).not.toHaveProperty("createdAt");
    await expectStatus(api.v1.rulesets[":id"].$get({ param: { id: NIL_UUID } }), 404);
  });

  test("answers a ruleset's content a page at a time, each thing named, searched by name", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const ruleset = api.v1.rulesets[":id"];

    const { items: classes } = await expectOk(ruleset.classes.$get({ param: { id }, query: { search: "Fighter" } }));
    expect(classes).toContainEqual(expect.objectContaining({ hitDie: 10, kind: "pc", name: "Fighter" }));

    const { items: feats } = await expectOk(ruleset.feats.$get({ param: { id }, query: { search: "Power Attack" } }));
    const powerAttack = feats.find(({ name }) => name === "Power Attack");
    expect(powerAttack?.pools.map(({ name }) => name)).toContain("Fighter Bonus Feat");

    const { items: races } = await expectOk(ruleset.races.$get({ param: { id }, query: { search: "Dwarf" } }));
    expect(races).toContainEqual(expect.objectContaining({ name: "Dwarf", size: "Medium", speed: 20 }));

    const { items: skills } = await expectOk(ruleset.skills.$get({ param: { id }, query: { search: "Climb" } }));
    expect(skills).toContainEqual(expect.objectContaining({ name: "Climb", usableUntrained: true }));

    const { items: spells } = await expectOk(ruleset.spells.$get({ param: { id }, query: { search: "Fireball" } }));
    const fireball = spells.find(({ name }) => name === "Fireball");
    expect(fireball?.lists).toContainEqual(expect.objectContaining({ level: 3, name: "Wizard Spells" }));

    const { items, nextPage, page } = await expectOk(ruleset.feats.$get({ param: { id }, query: { limit: "2" } }));
    expect({ count: items.length, nextPage, page }).toEqual({ count: 2, nextPage: 2, page: 1 });
  });
});
