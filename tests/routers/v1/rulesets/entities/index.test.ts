import { describe, expect, test } from "bun:test";

import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findBaseRuleset, findKind, listEntities, readRulesOf } from "@/tests/support/v1.ts";

/** The seed user's key, the base ruleset it reads, and its rules as `GET /v1/rules` describes them. */
async function keyedBase() {
  const { api } = await createKeyedApi();
  const { id } = await findBaseRuleset(api);
  return { api, id, rules: await readRulesOf(api, id) };
}

describe("v1 ruleset entities", () => {
  test("answers a kind's entities a page at a time, by group, as templates, and one with its parts", async () => {
    const { api, id, rules } = await keyedBase();
    const entities = api.v1.rulesets[":id"].entities[":kind"];
    const { type } = findKind(rules, ({ families }) => families);

    const { items, nextPage } = await expectOk(entities.$get({ param: { id, kind: type }, query: { limit: "2" } }));
    expect({ count: items.length, nextPage }).toEqual({ count: 2, nextPage: 2 });
    const [first] = items;
    expect((await listEntities(api, id, type, { search: first!.name })).map(({ id }) => id)).toContain(first!.id);
    await expectStatus(entities.$get({ param: { id, kind: type }, query: { nothing: "1" } }), 400);

    const entity = await expectOk(entities[":entityId"].$get({ param: { entityId: first!.id, id, kind: type } }));
    expect(entity).toMatchObject({ id: first!.id, name: first!.name, type });
    await expectStatus(entities[":entityId"].$get({ param: { entityId: NIL_UUID, id, kind: type } }), 404);

    const groups = await expectOk(entities.grouped.$get({ param: { id, kind: type }, query: {} }));
    expect(groups.items.length).toBeGreaterThan(0);
    const ungrouped = findKind(rules, ({ families }) => !families);
    await expectStatus(entities.grouped.$get({ param: { id, kind: ungrouped.type }, query: {} }), 404);
    const templated = findKind(rules, ({ templates }) => templates);
    const templates = await expectOk(entities.templates.$get({ param: { id, kind: templated.type }, query: {} }));
    expect(templates.length).toBeGreaterThan(0);
  });

  test("answers a progressing kind's owned entities, links, progression and each table the rules name", async () => {
    const { api, id, rules } = await keyedBase();
    const entities = api.v1.rulesets[":id"].entities[":kind"];
    const kind = findKind(rules, ({ owns, progression }) => progression && owns !== null);
    const [owner] = await listEntities(api, id, kind.type, { limit: "1" });
    const param = { entityId: owner!.id, id, kind: kind.type };

    const owned = await expectOk(entities[":entityId"].owned.$get({ param }));
    expect(owned.length).toBeGreaterThan(0);
    expect(owned[0]).toMatchObject({ ownerId: owner!.id, type: kind.owns });
    const ownedParam = { id, kind: kind.type, ownedId: owned[0]!.id };
    expect(await expectOk(entities.owned[":ownedId"].$get({ param: ownedParam }))).toMatchObject({
      id: owned[0]!.id,
      name: owner!.name,
    });

    if (kind.links) {
      // The first of a page of its entities that has links of its role
      const { role, type } = kind.links;
      let links: { role: string; toType: string }[] = [];
      for (const { id: entityId } of await listEntities(api, id, kind.type, { limit: "50" })) {
        links = await expectOk(entities[":entityId"].links.$get({ param: { ...param, entityId } }));
        if (links.length > 0) break;
      }
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((link) => link.role === role && link.toType === type)).toBe(true);
    }
    // Past its pools, a progression holds the values the rules name in theirs: each of them, and no other
    const progression = await expectOk(entities[":entityId"].progression.$get({ param }));
    const { list, picks, several } = rules.progression;
    const named = ["pools", list, picks, several].filter((key) => key !== null);
    expect(Object.keys(progression).toSorted()).toEqual(named.toSorted());
    expect(Array.isArray(progression.pools)).toBe(true);

    // Each table the kind names answers, at least one a row per owned level
    const tables = entities[":entityId"].tables[":table"];
    expect(kind.tables.length).toBeGreaterThan(0);
    const rows = [];
    for (const table of kind.tables) rows.push(await expectOk(tables.$get({ param: { ...param, table } })));
    expect(rows.some(({ length }) => length === owned.length)).toBe(true);
    await expectStatus(tables.$get({ param: { ...param, table: "nothing" } }), 404);
  });

  test("answers each kind's parts as the rules describe them: owned, progression, tables, customization", async () => {
    const { api, id, rules } = await keyedBase();
    const entities = api.v1.rulesets[":id"].entities[":kind"];
    const customization = api.v1.rulesets[":id"].customization[":kind"][":entityId"];

    for (const kind of rules.kinds) {
      const [entity] = await listEntities(api, id, kind.type, { limit: "1" });
      if (!entity) continue;
      const param = { entityId: entity.id, id, kind: kind.type };
      expect((await entities[":entityId"].owned.$get({ param })).status as number).toBe(kind.owns ? 200 : 404);
      expect((await entities[":entityId"].progression.$get({ param })).status as number).toBe(
        kind.progression ? 200 : 404,
      );
      const table = { ...param, table: kind.tables[0] ?? "nothing" };
      expect((await entities[":entityId"].tables[":table"].$get({ param: table })).status as number).toBe(
        kind.tables[0] ? 200 : 404,
      );
      const customized = { ...param, kind: kind.type as RulesetEntityType };
      const status = (await customization.modifiers.$get({ param: customized })).status as number;
      expect(status).toBe(rules.customizable.includes(kind.type) ? 200 : 400);
    }
  });

  test("creates an entity, updates it, duplicates a template and deletes it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { id } = await createFork(user.id, (await findBaseRuleset(api)).id);
    const rules = await readRulesOf(api, id);
    const entities = api.v1.rulesets[":id"].entities[":kind"];
    // A kind whose entity takes a name alone
    const { type } = findKind(
      rules,
      (kind) =>
        !kind.readOnly &&
        !kind.partitioned &&
        !kind.templates &&
        !(rules.fields[kind.type] ?? []).some(({ required }) => Boolean(required)),
    );

    const created = await expectOk(entities.$post({ json: { name: "Keyed Entity" }, param: { id, kind: type } }));
    expect(created).toMatchObject({ name: "Keyed Entity", rulesetId: id, type });
    const param = { entityId: created.id, id, kind: type };
    const json = { description: "Described", name: "Keyed Entity" };
    expect((await expectOk(entities[":entityId"].$put({ json, param }))).description).toBe("Described");

    // A template duplicates as a new entity made from it, with the template's fields
    const templated = findKind(rules, ({ templates }) => templates);
    const [template] = await expectOk(entities.templates.$get({ param: { id, kind: templated.type }, query: {} }));
    const copy = await expectOk(
      entities[":entityId"].duplicate.$post({
        json: { fields: template!.fields as Record<string, number | string>, name: "Keyed Copy" },
        param: { entityId: template!.id, id, kind: templated.type },
      }),
    );
    expect(copy).toMatchObject({ name: "Keyed Copy", type: templated.type });
    expect(copy.links).toContainEqual(expect.objectContaining({ toId: template!.id }));

    await expectStatus(entities[":entityId"].$delete({ param }), 204);
    await expectStatus(entities[":entityId"].$get({ param }), 404);
  });
});
