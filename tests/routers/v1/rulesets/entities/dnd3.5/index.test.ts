import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A new user's key, and a fork of the seeded ruleset of theirs. */
async function keyedFork() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const fork = await createSeededTestRuleset(user.id);
  return { api, fork, id: fork.id, rulesets: api.v1.rulesets[":id"] };
}

describe("v1 ruleset entities", () => {
  test("answers a kind's entities a page at a time, filtered as the kind takes, and one with its parts", async () => {
    const { api } = await createKeyedApi();
    const { featMap, rulesetId: id } = await getSeedCtx();
    const entities = api.v1.rulesets[":id"].entities[":kind"];

    const { items, nextPage } = await expectOk(entities.$get({ param: { id, kind: "feats" }, query: { limit: "2" } }));
    expect({ count: items.length, nextPage }).toEqual({ count: 2, nextPage: 2 });
    const { items: found } = await expectOk(
      entities.$get({ param: { id, kind: "feats" }, query: { search: "Power Attack" } }),
    );
    const powerAttack = found.find(({ name }) => name === "Power Attack");
    expect(powerAttack).toMatchObject({ id: featMap["Power Attack"], type: "feats" });
    expect(powerAttack?.links).toContainEqual(expect.objectContaining({ role: "listedIn", toType: "aptitudes" }));
    await expectStatus(entities.$get({ param: { id, kind: "feats" }, query: { nothing: "1" } }), 400);

    const feat = await expectOk(
      entities[":entityId"].$get({ param: { entityId: featMap["Power Attack"]!, id, kind: "feats" } }),
    );
    expect(feat).toMatchObject({ modifiers: expect.any(Array), name: "Power Attack", requirements: expect.any(Array) });
    await expectStatus(entities[":entityId"].$get({ param: { entityId: NIL_UUID, id, kind: "feats" } }), 404);

    const groups = await expectOk(entities.grouped.$get({ param: { id, kind: "feats" }, query: {} }));
    expect(groups.items.length).toBeGreaterThan(0);
    await expectStatus(entities.grouped.$get({ param: { id, kind: "skills" }, query: {} }), 404);
    const templates = await expectOk(entities.templates.$get({ param: { id, kind: "items" }, query: {} }));
    expect(templates.length).toBeGreaterThan(0);
  });

  test("answers a class's levels, one by its id alone, its skills, its progression and its tables", async () => {
    const { api } = await createKeyedApi();
    const { classMap, rulesetId: id } = await getSeedCtx();
    const entities = api.v1.rulesets[":id"].entities[":kind"];
    const param = { entityId: classMap.pc!.Wizard!, id, kind: "classes" };

    const levels = await expectOk(entities[":entityId"].owned.$get({ param }));
    expect(levels.map(({ position }) => position).slice(0, 3)).toEqual([1, 2, 3]);
    expect(levels[0]).toMatchObject({ name: null, ownerId: param.entityId });
    expect(levels[0]).not.toHaveProperty("babLabel");
    const level = await expectOk(
      entities.owned[":ownedId"].$get({ param: { id, kind: "classes", ownedId: levels[0]!.id } }),
    );
    expect(level).toMatchObject({ id: levels[0]!.id, name: "Wizard", requirements: expect.any(Array) });

    expect(await expectOk(entities[":entityId"].links.$get({ param }))).toContainEqual(
      expect.objectContaining({ role: "classSkill", toType: "skills" }),
    );
    // Past its pools, a progression holds what the rules name in theirs: 3.5's spell list, at `spellList`
    const progression = await expectOk(entities[":entityId"].progression.$get({ param }));
    const rules = await expectOk(api.v1.rules.$get());
    const { list } = rules["Dungeons & Dragons: 3.5"]!.progression;
    expect(progression[list!]).toMatchObject({ name: expect.any(String) });
    const spells = await expectOk(
      entities[":entityId"].tables[":table"].$get({ param: { ...param, table: "spells" } }),
    );
    expect(spells.length).toBe(levels.length);
    await expectStatus(entities[":entityId"].tables[":table"].$get({ param: { ...param, table: "nothing" } }), 404);
  });

  test("creates an entity, updates it, duplicates one and deletes it", async () => {
    const { id, rulesets } = await keyedFork();
    const entities = rulesets.entities[":kind"];
    const kind = { id, kind: "languages" };

    const created = await expectOk(entities.$post({ json: { name: "Keyed Tongue" }, param: kind }));
    expect(created).toMatchObject({ name: "Keyed Tongue", rulesetId: id, type: "languages" });
    const param = { ...kind, entityId: created.id };
    const updated = await expectOk(
      entities[":entityId"].$put({ json: { description: "Spoken", name: "Keyed Tongue" }, param }),
    );
    expect(updated.description).toBe("Spoken");
    // An item duplicates a template, as a new item made from it
    const [shield] = await expectOk(
      entities.templates.$get({ param: { id, kind: "items" }, query: { type: "Shield" } }),
    );
    const copy = await expectOk(
      entities[":entityId"].duplicate.$post({
        json: { fields: { [ITEM_TYPE]: "Shield" }, name: "Keyed Buckler" },
        param: { entityId: shield!.id, id, kind: "items" },
      }),
    );
    expect(copy).toMatchObject({ name: "Keyed Buckler", type: "items" });
    expect(copy.links).toContainEqual(expect.objectContaining({ role: "madeFrom", toId: shield!.id }));
    await expectStatus(entities[":entityId"].$delete({ param }), 204);
    await expectStatus(entities[":entityId"].$get({ param }), 404);
  });
});
