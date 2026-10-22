import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";

/** An entity kind's URL segment, as the routes by kind take it. */
type Segment = Parameters<
  (typeof api.api.rulesets)[":id"]["entities"][":entityType"]["$get"]
>[0]["param"]["entityType"];

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const grouped = kinds.grouped;
const templates = kinds.templates;

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
    const { id, spellList } = await setup();
    const ids = (page: { items: { id: string }[] }) => page.items.map((row) => row.id).sort();
    const list = (entityType: Segment, query: Record<string, string>) =>
      expectOk(kinds.$get({ param: { id, entityType }, query: { limit: "100", ...query } }));

    // A new pool's feats, and its feats of a family: those alone
    const pool = await expectOk(kinds.$post({ param: { id, entityType: "aptitudes" }, json: { name: "Test Pool" } }));
    const feat = (form: { fields?: { families: string[] }; name: string }) =>
      expectOk(kinds.$post({ param: { id, entityType: "feats" }, json: { ...form, aptitudeIds: [pool.id] } }));
    const focus = await feat({ name: "Test Focus", fields: { families: [FEAT_FAMILIES[0]] } });
    const plain = await feat({ name: "Test Plain" });
    expect(ids(await list("feats", { aptitudeId: pool.id }))).toEqual([focus.id, plain.id].sort());
    expect(ids(await list("feats", { aptitudeId: pool.id, family: FEAT_FAMILIES[0] }))).toEqual([focus.id]);
    const groups = (query: Record<string, string>) =>
      expectOk(grouped.$get({ param: { id, entityType: "feats" }, query: { aptitudeId: pool.id, ...query } }));
    const representatives = (page: { items: { representativeId: string }[] }) =>
      page.items.map((group) => group.representativeId).sort();
    expect(representatives(await groups({}))).toEqual([focus.id, plain.id].sort());
    expect(representatives(await groups({ search: "Test Focus" }))).toEqual([focus.id]);

    // A spell list's spells of one level: none of another's
    const zero = ids(await list("powers", { aptitudeId: spellList.id, level: "0" }));
    const one = ids(await list("powers", { aptitudeId: spellList.id, level: "1" }));
    expect(zero.length).toBeGreaterThan(0);
    expect(one.length).toBeGreaterThan(0);
    expect(zero.filter((spellId) => one.includes(spellId))).toEqual([]);

    // A player character's races and classes, an item's templates and the items that aren't
    for (const entityType of ["races", "classes"] as const) {
      const pcs = (await list(entityType, { kind: "pc" })).items;
      expect(pcs.length).toBeGreaterThan(0);
      expect(pcs.every((row) => row.kind === "pc")).toBe(true);
    }
    expect((await list("items", { isTemplate: "true" })).items.every((item) => item.isTemplate === true)).toBe(true);
    expect((await list("items", { isTemplate: "false" })).items.every((item) => item.isTemplate === false)).toBe(true);

    // A filter its kind takes none of, its groups' too, by key, and a filter's value of another type
    const refused = await expectStatus(kinds.$get({ param: { id, entityType: "races" }, query: { level: "1" } }), 400);
    expect(await refused.json()).toMatchObject({
      issues: [{ category: "level", message: "races take no level filter" }],
    });
    const groupFamily = grouped.$get({ param: { id, entityType: "feats" }, query: { family: FEAT_FAMILIES[0] } });
    expect(await (await expectStatus(groupFamily, 400)).json()).toMatchObject({ issues: [{ category: "family" }] });
    await expectStatus(kinds.$get({ param: { id, entityType: "feats" }, query: { aptitudeId: "pool" } }), 400);
    await expectStatus(kinds.$get({ param: { id, entityType: "powers" }, query: { level: "one" } }), 400);
  });

  test("reads a list's shared query: its order, its page, its own entities alone", async () => {
    const { id } = await setup();
    const names = (page: { items: { name: string }[] }) => page.items.map((row) => row.name);
    const list = (query: Record<string, string>) =>
      expectOk(kinds.$get({ param: { id, entityType: "languages" }, query }));

    const ascending = names(await list({ orderBy: "name", orderDir: "asc", limit: "100" }));
    const descending = names(await list({ orderBy: "name", orderDir: "desc", limit: "100" }));
    expect(ascending.length).toBeGreaterThan(1);
    expect(descending).toEqual(ascending.toReversed());

    const first = await list({ limit: "1", page: "1" });
    const second = await list({ limit: "1", page: "2" });
    expect(first.nextPage).toBe(2);
    expect(names(first)).toEqual(ascending.slice(0, 1));
    expect(names(second)).toEqual(ascending.slice(1, 2));

    // A fork's own entities, those it inherits left out; "false" reads as no
    await expectOk(
      kinds.$post({ param: { id, entityType: "languages" }, json: { name: "Test Cant", type: "Secret" } }),
    );
    expect(names(await list({ childOnly: "true" }))).toEqual(["Test Cant"]);
    expect(names(await list({ childOnly: "false", limit: "100" }))).toEqual(
      [...ascending, "Test Cant"].sort((a, b) => a.localeCompare(b)),
    );
  });

  test("answers a kind's actions: its groups, its templates, a duplicate and variants; refused for a kind without", async () => {
    const { id } = await setup();
    const groups = await expectOk(grouped.$get({ param: { id, entityType: "feats" }, query: {} }));
    expect(groups.items.length).toBeGreaterThan(0);
    const shields = await expectOk(templates.$get({ param: { id, entityType: "items" }, query: { type: "Shield" } }));
    expect(shields.every((item) => item.type === "Shield" && item.isTemplate)).toBe(true);

    const [shield] = shields;
    const param = { id, entityType: "items" as const, entityId: shield.id };
    const copy = await expectOk(entity.duplicate.$post({ param, json: { name: "Test Buckler", type: "Shield" } }));
    expect(copy).toMatchObject({ name: "Test Buckler", sourceItemId: shield.id, isTemplate: false });
    await expectOk(
      entity.variants.$post({
        param,
        json: { variants: [{ name: "Test Spiked Buckler", description: "Spiked" }, { name: "Test Tower" }] },
      }),
    );
    const made = await expectOk(kinds.$get({ param: { id, entityType: "items" }, query: { search: "Test Spiked" } }));
    expect(made.items).toMatchObject([
      { name: "Test Spiked Buckler", description: "Spiked", type: "Shield", sourceItemId: shield.id },
    ]);

    await expectStatus(grouped.$get({ param: { id, entityType: "races" }, query: {} }), 404);
    const classTemplates = templates.$get({ param: { id, entityType: "classes" }, query: {} });
    expect(await (await expectStatus(classTemplates, 404)).json()).toMatchObject({
      message: "No templates for classes",
    });
    const [feat] = (await expectOk(kinds.$get({ param: { id, entityType: "feats" }, query: { limit: "1" } }))).items;
    await expectStatus(
      entity.duplicate.$post({ param: { id, entityType: "feats", entityId: feat.id }, json: { name: "Copy" } }),
      404,
    );
    await expectStatus(templates.$get({ param: { id, entityType: "feats" }, query: {} }), 404);
  });

  test("refuses a kind it doesn't know, and an entity the ruleset has none of", async () => {
    const { id } = await setup();
    await expectStatus(kinds.$get({ param: { id, entityType: "widgets" as never }, query: {} }), 400);
    // A class is named by its URL segment, never its table
    await expectStatus(kinds.$get({ param: { id, entityType: "klasses" as never }, query: {} }), 400);
    await expectStatus(entity.$get({ param: { id, entityType: "races", entityId: NIL_UUID } }), 404);
  });
});
