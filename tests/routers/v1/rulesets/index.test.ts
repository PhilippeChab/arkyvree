import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededForkWithAptitude } from "@/tests/support/rulesets.ts";
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
    expect(powerAttack?.aptitudes.map(({ name }) => name)).toContain("Fighter Bonus Feat");

    const { items: races } = await expectOk(ruleset.races.$get({ param: { id }, query: { search: "Dwarf" } }));
    expect(races).toContainEqual(expect.objectContaining({ name: "Dwarf", size: "Medium", speed: 20 }));

    const { items: skills } = await expectOk(ruleset.skills.$get({ param: { id }, query: { search: "Climb" } }));
    expect(skills).toContainEqual(
      expect.objectContaining({ fields: expect.objectContaining({ usableWithoutTraining: true }), name: "Climb" }),
    );

    const { items: spells } = await expectOk(ruleset.spells.$get({ param: { id }, query: { search: "Fireball" } }));
    const fireball = spells.find(({ name }) => name === "Fireball");
    expect(fireball?.aptitudes).toContainEqual(expect.objectContaining({ level: 3, name: "Wizard Spells" }));

    const { items, nextPage, page } = await expectOk(ruleset.feats.$get({ param: { id }, query: { limit: "2" } }));
    expect({ count: items.length, nextPage, page }).toEqual({ count: 2, nextPage: 2, page: 1 });
  });

  test("answers a ruleset's settings, and the fields it declares by kind, as v1's routes name them", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, rulesetId: id } = await getSeedCtx();
    const ruleset = api.v1.rulesets[":id"];

    const { fields: settings } = await expectOk(ruleset.settings.$get({ param: { id } }));
    expect(settings).toMatchObject({ abilityIncreases: { every: 4 }, skillPointAbilityId: abilityMap.Intelligence });

    const declarations = await expectOk(ruleset.fields.$get({ param: { id } }));
    expect(Object.keys(declarations).sort()).toEqual([
      "class-levels",
      "classes",
      "feats",
      "items",
      "races",
      "rulesets",
      "skills",
      "spells",
    ]);
    expect(declarations.classes).toContainEqual(
      expect.objectContaining({ input: "ref", key: "bonusSpellAbilityId", references: "abilities" }),
    );
    expect(declarations.items).toContainEqual(
      expect.objectContaining({ fields: expect.any(Array), input: "group", key: "weapon" }),
    );
  });

  test("answers the extensions a ruleset is subscribed to", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    expect(await expectOk(api.v1.rulesets[":id"].extensions.$get({ param: { id } }))).toContainEqual(
      expect.objectContaining({ name: "Complete Warrior SRD 3.5", updateAvailable: false }),
    );
  });

  test("answers what a fork changed of its parent, and refuses a ruleset that's no fork", async () => {
    const { api } = await createKeyedApi(SEED_USER_ID);
    const { aptitudeId, id } = await createSeededForkWithAptitude();
    const changes = api.v1.rulesets[":id"].changes;
    expect(await expectOk(changes.$get({ param: { id } }))).toContainEqual(
      expect.objectContaining({ entityId: aptitudeId, kind: "aptitudes", sourceId: null, status: "added" }),
    );
    await expectStatus(changes.$get({ param: { id: (await getSeedCtx()).rulesetId } }), 400);
  });
});
