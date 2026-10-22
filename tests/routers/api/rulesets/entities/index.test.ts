import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

/** An entity kind's URL segment, as the routes by kind take it. */
type Segment = Parameters<
  (typeof api.api.rulesets)[":id"]["entities"][":entityType"]["$get"]
>[0]["param"]["entityType"];

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];

/** A seeded fork, and the entities a new one names: an ability, a feat pool and a spell list. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const list = async (entityType: Segment, query: Record<string, string> = {}) =>
    (await expectOk(kinds.$get({ param: { id, entityType }, query: { limit: "1", ...query } }))).items;
  const [ability] = await list("abilities");
  const [featPool] = await list("aptitudes", { scope: "feats" });
  const [spellList] = await list("aptitudes", { scope: "spells" });
  return { id, ability, featPool, spellList };
}

describe("rulesets entities by kind", () => {
  test("creates, reads, lists, updates and deletes an entity of every kind but the read-only abilities", async () => {
    const { id, ability, featPool, spellList } = await setup();
    // Each kind by its URL segment, a new one's form (its columns, as its rules describe them), and what its row keeps
    const forms: [Segment, Record<string, unknown>, Record<string, unknown>][] = [
      ["races", { size: "Small", baseSpeed: 20 }, { size: "Small", baseSpeed: 20 }],
      ["languages", { type: "Spoken" }, { type: "Spoken" }],
      ["skills", { primaryAbilityId: ability.id }, { primaryAbilityId: ability.id }],
      ["feats", { aptitudeIds: [featPool.id] }, { generated: false }],
      ["powers", { aptitudes: [{ id: spellList.id, level: 1 }], saveEffect: "" }, { saveEffect: null }],
      ["items", { costGp: 5 }, { costGp: "5.00" }],
      ["aptitudes", {}, {}],
      ["classes", { hd: 10 }, { hd: 10 }],
      ["saves", { abilityId: ability.id }, { abilityId: ability.id }],
      ["mechanics", {}, {}],
    ];
    for (const [entityType, columns, kept] of forms) {
      const name = `Test ${entityType}`;
      const created = await expectOk(kinds.$post({ param: { id, entityType }, json: { name, ...columns } }));
      expect(created).toMatchObject({ name, ...kept });
      const param = { id, entityType, entityId: created.id };

      expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name });
      const listed = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: name } }));
      expect(listed.items.map((row) => row.id)).toContain(created.id);

      const renamed = await expectOk(entity.$put({ param, json: { name: `${name} renamed` } }));
      expect(renamed).toMatchObject({ id: created.id, name: `${name} renamed` });

      await expectOk(entity.$delete({ param }));
      await expectStatus(entity.$get({ param }), 404);
    }
  });

  test("reads abilities, and refuses writing one: its kind lets no form create, edit or delete it", async () => {
    const { id, ability } = await setup();
    const param = { id, entityType: "abilities" as const, entityId: ability.id };
    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: ability.id });
    await expectStatus(kinds.$post({ param: { id, entityType: "abilities" }, json: { name: "Luck" } }), 404);
    await expectStatus(entity.$put({ param, json: { name: "Luck" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });

  test("filters a list by its kind's filters, and refuses one its kind takes none of", async () => {
    const { id, featPool, spellList } = await setup();
    const feats = await expectOk(
      kinds.$get({ param: { id, entityType: "feats" }, query: { aptitudeId: featPool.id, limit: "100" } }),
    );
    expect(feats.items.length).toBeGreaterThan(0);
    const spells = await expectOk(
      kinds.$get({ param: { id, entityType: "powers" }, query: { aptitudeId: spellList.id, level: "1" } }),
    );
    expect(spells.items.length).toBeGreaterThan(0);
    const templates = await expectOk(kinds.$get({ param: { id, entityType: "items" }, query: { isTemplate: "true" } }));
    expect(templates.items.every((item) => item.isTemplate)).toBe(true);

    const refused = await expectStatus(kinds.$get({ param: { id, entityType: "races" }, query: { level: "1" } }), 400);
    expect(await refused.json()).toMatchObject({
      issues: [{ category: "level", message: "races take no level filter" }],
    });
    await expectStatus(kinds.$get({ param: { id, entityType: "feats" }, query: { aptitudeId: "pool" } }), 400);
  });

  test("answers a kind's actions: its groups, its templates, a duplicate and variants; refused for a kind without", async () => {
    const { id } = await setup();
    const groups = await expectOk(
      api.api.rulesets[":id"].entities[":entityType"].grouped.$get({
        param: { id, entityType: "feats" },
        query: {},
      }),
    );
    expect(groups.items.length).toBeGreaterThan(0);
    const shields = await expectOk(
      api.api.rulesets[":id"].entities[":entityType"].templates.$get({
        param: { id, entityType: "items" },
        query: { type: "Shield" },
      }),
    );
    expect(shields.every((item) => item.type === "Shield" && item.isTemplate)).toBe(true);

    const [shield] = shields;
    const param = { id, entityType: "items" as const, entityId: shield.id };
    const copy = await expectOk(entity.duplicate.$post({ param, json: { name: "Test Buckler", type: "Shield" } }));
    expect(copy).toMatchObject({ name: "Test Buckler", sourceItemId: shield.id, isTemplate: false });
    await expectOk(
      entity.variants.$post({ param, json: { variants: [{ name: "Test Spiked Buckler" }, { name: "Test Tower" }] } }),
    );

    await expectStatus(
      api.api.rulesets[":id"].entities[":entityType"].grouped.$get({ param: { id, entityType: "races" }, query: {} }),
      404,
    );
    await expectStatus(
      api.api.rulesets[":id"].entities[":entityType"].templates.$get({ param: { id, entityType: "feats" }, query: {} }),
      404,
    );
  });

  test("refuses a kind it doesn't know, and an entity the ruleset has none of", async () => {
    const { id } = await setup();
    await expectStatus(kinds.$get({ param: { id, entityType: "widgets" as never }, query: {} }), 400);
    // A class is named by its URL segment, never its table
    await expectStatus(kinds.$get({ param: { id, entityType: "klasses" as never }, query: {} }), 400);
    await expectStatus(entity.$get({ param: { id, entityType: "races", entityId: NIL_UUID } }), 404);
  });
});
