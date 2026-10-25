import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";
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

/** What a request refused as not found answers. */
async function refusalOf<T extends { clone(): { text(): Promise<string> }; json(): Promise<unknown>; status: number }>(
  response: Promise<T>,
) {
  return await (await expectStatus(response, 404)).json();
}

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
      ["spells", { aptitudes: [{ id: spellList.id, level: 1 }], saveEffect: "" }, { saveEffect: null }],
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
    const zero = ids(await list("spells", { aptitudeId: spellList.id, level: "0" }));
    const one = ids(await list("spells", { aptitudeId: spellList.id, level: "1" }));
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
    await expectStatus(kinds.$get({ param: { id, entityType: "spells" }, query: { level: "one" } }), 400);
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
    const all = names(await list({ childOnly: "false", limit: "100" }));
    expect(all).toContain("Test Cant");
    expect(all.length).toBe(ascending.length + 1);
  });

  test("answers a kind's actions: its groups, its templates, a duplicate and variants; refused for a kind without", async () => {
    const { id } = await setup();
    const groups = await expectOk(grouped.$get({ param: { id, entityType: "feats" }, query: {} }));
    expect(groups.items.length).toBeGreaterThan(0);
    const shields = await expectOk(templates.$get({ param: { id, entityType: "items" }, query: { type: "Shield" } }));
    expect(shields.every((item) => item.type === "Shield" && item.isTemplate)).toBe(true);

    const [shield] = shields;
    const param = { id, entityType: "items" as const, entityId: shield.id };
    // An item's read says where a character carrying it places it: a shield, in a hand of a weapon set
    expect(await expectOk(entity.$get({ param }))).toMatchObject({
      id: shield.id,
      placement: { hand: false, locations: expect.arrayContaining([expect.objectContaining({ grouped: true })]) },
    });
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

  test("refuses a part a kind has none of, a table it has none of, and an id that isn't one", async () => {
    const { id } = await setup();
    const first = async (entityType: Segment) =>
      (await expectOk(kinds.$get({ param: { id, entityType }, query: { limit: "1" } }))).items[0];
    const race = { id, entityType: "races" as const, entityId: (await first("races")).id };

    expect(await refusalOf(entity.links.$get({ param: race }))).toMatchObject({ message: "No links for races" });
    expect(await refusalOf(entity.owned.$get({ param: race }))).toMatchObject({
      message: "No owned entities for races",
    });
    expect(await refusalOf(entity.progression.$get({ param: race }))).toMatchObject({
      message: "No progression for races",
    });
    expect(await refusalOf(entity.tables[":table"].$get({ param: { ...race, table: "spells" } }))).toMatchObject({
      message: "No tables for races",
    });
    expect(await refusalOf(entity.links.$post({ param: race, json: { targetId: NIL_UUID } }))).toMatchObject({
      message: "No links for races",
    });
    const byId = kinds.owned[":ownedId"];
    expect(await refusalOf(byId.$get({ param: { id, entityType: "races", ownedId: NIL_UUID } }))).toMatchObject({
      message: "No owned entities for races",
    });
    await expectStatus(byId.$get({ param: { id, entityType: "classes", ownedId: "not-an-id" } }), 400);
    const klass = { id, entityType: "classes" as const, entityId: (await first("classes")).id };
    expect(await refusalOf(entity.tables[":table"].$get({ param: { ...klass, table: "maneuvers" } }))).toMatchObject({
      message: "No maneuvers table for classes",
    });

    await expectStatus(entity.owned.$get({ param: { ...klass, entityId: "not-an-id" } }), 400);
    await expectStatus(entity.owned[":ownedId"].$delete({ param: { ...klass, ownedId: "not-an-id" } }), 400);
    await expectStatus(entity.links[":targetId"].$delete({ param: { ...klass, targetId: "not-an-id" } }), 400);
    await expectStatus(entity.links.$post({ param: klass, json: { targetId: "not-an-id" } }), 400);
  });

  test("reads a class's tables and lists where its rules' progression says, a level's totals at its table's key", async () => {
    const { id } = await setup();
    const { progression } = (await expectOk(api.api.rules.$get()))["Dungeons & Dragons: 3.5"];
    const [wizard] = (
      await expectOk(kinds.$get({ param: { id, entityType: "classes" }, query: { search: "Wizard", limit: "1" } }))
    ).items;
    const klass = { id, entityType: "classes" as const, entityId: wizard.id };
    for (const { table, totals } of progression.tables) {
      const rows = await expectOk(entity.tables[":table"].$get({ param: { ...klass, table } }));
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row).toHaveProperty(totals);
    }
    const { counts } = progression;
    const lists = await expectOk(entity.tables[":table"].$get({ param: { ...klass, table: counts?.lists ?? "" } }));
    expect(lists).toMatchObject([{ name: "Wizard Spells" }]);
    const answer = await expectOk(entity.progression.$get({ param: klass }));
    expect(answer).toMatchObject({ [counts?.list ?? ""]: { name: "Wizard Spells" }, [counts?.several ?? ""]: false });
  });

  test("answers each kind's filters and actions as its rules describe it", async () => {
    const { id } = await setup();
    const rules = await expectOk(api.api.rules.$get());
    /** Whether a refusal says the kind has none of an action ("No variants for races"), not that its entity is missing */
    const refusesAction = async (response: { json: () => Promise<unknown> }, words: string, entityType: string) => {
      const body: unknown = await response.json();
      return isRecord(body) && body.message === `No ${words} for ${entityType}`;
    };
    for (const { copies, families, levels, pools, readOnly, type } of rules["Dungeons & Dragons: 3.5"].kinds) {
      const entityType = getUrlSegment(type) as Segment;
      const list = (query: Record<string, string>) => kinds.$get({ param: { id, entityType }, query });
      const groups = await grouped.$get({ param: { id, entityType }, query: {} });
      // A copy of an entity the ruleset has none of: missing for a kind that copies, refused for any other
      const param = { id, entityType, entityId: NIL_UUID };
      const duplicate = await entity.duplicate.$post({ param, json: { name: "Copy" } });
      const variants = await entity.variants.$post({ param, json: { variants: [{ name: "Copy" }] } });
      // A delete of one it has none of: missing for a kind it writes, refused for a read-only one
      const remove = await entity.$delete({ param });
      const statuses: number[] = [duplicate.status, variants.status, remove.status];
      expect({ type, statuses }).toEqual({ type, statuses: [404, 404, 404] });
      expect({
        type,
        pools: (await list({ aptitudeId: NIL_UUID })).status === 200,
        levels: (await list({ level: "1" })).status === 200,
        groups: groups.status === 200,
        duplicate: !(await refusesAction(duplicate, "duplicate", entityType)),
        variants: !(await refusesAction(variants, "variants", entityType)),
        writes: !(await refusesAction(remove, "delete", entityType)),
      }).toEqual({
        type,
        pools: !!pools,
        levels: !!levels,
        groups: !!families,
        duplicate: !!copies,
        variants: !!copies,
        writes: !readOnly,
      });
    }
  });

  test("lists the pools of the scope each kind's description narrows its list by", async () => {
    const { id } = await setup();
    const rules = await expectOk(api.api.rules.$get());
    const scoped = rules["Dungeons & Dragons: 3.5"].kinds.filter((kind) => kind.pools);
    const aptitudes = { key: "aptitudeId", param: "aptitude", type: "aptitudes" };
    expect(scoped.map(({ pools }) => pools)).toEqual([
      { ...aptitudes, scope: "feats" },
      { ...aptitudes, scope: "spells" },
    ]);
    const idsOf = async (scope: string) =>
      (
        await expectOk(kinds.$get({ param: { id, entityType: "aptitudes" }, query: { limit: "100", scope } }))
      ).items.map((pool) => pool.id);
    const [featPools, spellLists] = await Promise.all(scoped.map(({ pools }) => idsOf(pools?.scope ?? "")));
    // Each scope narrows the list to its own pools
    expect(featPools.length).toBeGreaterThan(0);
    expect(spellLists.length).toBeGreaterThan(0);
    expect(featPools.filter((poolId) => spellLists.includes(poolId))).toEqual([]);
  });

  test("reads an entity's pools where its kind's columns say its links are", async () => {
    const { id, featPool, spellList } = await setup();
    const rules = await expectOk(api.api.rules.$get());
    const pools: Record<string, string> = { feats: featPool.id, spells: spellList.id };
    const visited: string[] = [];
    for (const [type, columns] of Object.entries(rules["Dungeons & Dragons: 3.5"].columns)) {
      for (const column of columns ?? []) {
        if ((column.input !== "links" && column.input !== "leveledLinks") || !column.role) continue;
        // An entity of its kind in a pool: its read holds its link to it, its aptitude named, its level where it has one
        visited.push(type);
        expect(Object.keys(pools)).toContain(type);
        const entityType = getUrlSegment(type) as Segment;
        const query = { aptitudeId: pools[type] ?? "", limit: "1" };
        const [listed] = (await expectOk(kinds.$get({ param: { id, entityType }, query }))).items;
        const read: Record<string, unknown> = await expectOk(
          entity.$get({ param: { id, entityType, entityId: listed.id } }),
        );
        expect({ type, links: read.links }).toMatchObject({
          type,
          links: expect.arrayContaining([
            expect.objectContaining({
              role: column.role,
              toId: pools[type],
              toName: expect.any(String),
              ...(column.input === "leveledLinks" && { tier: expect.any(Number) }),
            }),
          ]),
        });
      }
    }
    // Both pools' columns: a feat's, and a spell's at its level
    expect(visited.sort()).toEqual(["feats", "spells"]);
  });

  test("refuses a kind it doesn't know, and an entity the ruleset has none of", async () => {
    const { id } = await setup();
    await expectStatus(kinds.$get({ param: { id, entityType: "widgets" as never }, query: {} }), 400);
    // A kind of two words is named by its URL segment, never by its type's own spelling
    await expectStatus(kinds.$get({ param: { id, entityType: "class_levels" as never }, query: {} }), 400);
    await expectStatus(entity.$get({ param: { id, entityType: "races", entityId: NIL_UUID } }), 404);
  });
});
