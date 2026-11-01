import { describe, expect, test } from "bun:test";

import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset, createSeededTestRulesetWithExtensions } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("v1 rulesets", () => {
  test("lists the rulesets the user can read, and answers one with what they may do with it", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId } = await getSeedCtx();
    const { items } = await expectOk(api.v1.rulesets.$get({ query: { scope: "base" } }));
    expect(items.map(({ id }) => id)).toContain(rulesetId);

    const ruleset = await expectOk(api.v1.rulesets[":id"].$get({ param: { id: rulesetId } }));
    expect(ruleset).toMatchObject({ id: rulesetId, kind: "ruleset", parentId: null, parentName: null, system: true });
    expect(ruleset.permissions).toMatchObject({ canFork: true });
    await expectStatus(api.v1.rulesets[":id"].$get({ param: { id: NIL_UUID } }), 404);
  });

  test("answers what each base rules' rulesets are made of, which other answers key by", async () => {
    const { api } = await createKeyedApi();
    const rules = (await expectOk(api.v1.rules.$get()))["Dungeons & Dragons: 3.5"]!;
    expect(rules.kinds).toContainEqual(expect.objectContaining({ families: true, type: "feats" }));
    expect(rules.kinds).toContainEqual(expect.objectContaining({ tiered: true, type: "spells" }));
    expect(rules.characterKinds).toContainEqual({ label: "Player Character", value: "pc" });
    expect(rules.fields.feats?.length).toBeGreaterThan(0);
    expect(rules.tiers[0]).toEqual({ label: expect.any(String), level: 0 });
    expect(rules.progression).toEqual({ list: "spellList", picks: "featPicks", several: "severalSpellLists" });
  });

  test("answers a ruleset's settings and extensions", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, rulesetId: id } = await getSeedCtx();
    const ruleset = api.v1.rulesets[":id"];

    const settings = await expectOk(ruleset.settings.$get({ param: { id } }));
    expect(settings.links).toMatchObject({ skillPointAbility: abilityMap.Intelligence });
    expect(Object.keys(settings.fields).length).toBeGreaterThan(0);
    expect(await expectOk(ruleset.extensions.$get({ param: { id } }))).toEqual([]);
    const { user } = await createTestUser();
    const fork = await createSeededTestRulesetWithExtensions(user.id);
    const keyed = await createKeyedApi(user.id);
    expect(await expectOk(keyed.api.v1.rulesets[":id"].extensions.$get({ param: { id: fork.id } }))).toContainEqual(
      expect.objectContaining({ subscribedAt: expect.any(String), updateAvailable: false }),
    );
  });

  test("answers what a fork changed of its parent, and refuses a ruleset that's no fork", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const fork = await createSeededTestRuleset(user.id);
    const added = await EntitiesService.createEntity({ userId: user.id }, fork.id, "languages", {
      description: null,
      name: "Test Tongue",
    });
    const changes = api.v1.rulesets[":id"].changes;
    expect(await expectOk(changes.$get({ param: { id: fork.id } }))).toEqual([
      { entityId: added.id, kind: "languages", name: "Test Tongue", sourceId: null, status: "added" },
    ]);
    await expectStatus(changes.$get({ param: { id: (await getSeedCtx()).rulesetId } }), 400);
  });

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

  test("answers an entity's modifiers and requirements, labeled", async () => {
    const { api } = await createKeyedApi();
    const { featMap, rulesetId: id } = await getSeedCtx();
    const customization = api.v1.rulesets[":id"].customization[":kind"][":entityId"];
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" as const };

    expect(await expectOk(customization.modifiers.$get({ param }))).toEqual(expect.any(Array));
    const requirements = await expectOk(customization.requirements.$get({ param }));
    expect(requirements).toContainEqual(expect.objectContaining({ targetLabels: expect.any(Object) }));
  });
});
