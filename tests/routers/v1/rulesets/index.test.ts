import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork, createSeededForkWithAptitude } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

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

  test("stars a base ruleset for the key's user, and unstars it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId: id } = await getSeedCtx();
    const ruleset = api.v1.rulesets[":id"];
    const { starCount } = await expectOk(ruleset.$get({ param: { id } }));

    await expectStatus(ruleset.star.$post({ param: { id } }), 204);
    expect(await expectOk(ruleset.$get({ param: { id } }))).toMatchObject({ starCount: starCount + 1, starred: true });
    await expectStatus(ruleset.star.$delete({ param: { id } }), 204);
    expect(await expectOk(ruleset.$get({ param: { id } }))).toMatchObject({ starCount, starred: false });
  });

  test("refuses a fork's or a rename's name another ruleset has, an archived one's too", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId: coreId } = await getSeedCtx();
    const rulesets = api.v1.rulesets[":id"];
    const fork = async (name: string) => await expectOk(rulesets.fork.$post({ json: { name }, param: { id: coreId } }));

    const archived = await fork("Old Table Rules");
    await expectStatus(rulesets.archive.$post({ param: { id: archived.id } }), 204);
    const { id } = await fork("New Table Rules");

    await expectStatus(rulesets.fork.$post({ json: { name: "Old Table Rules" }, param: { id: coreId } }), 409);
    await expectStatus(rulesets.$put({ json: { name: "Old Table Rules" }, param: { id } }), 409);
  });

  test("forks a ruleset, changes it and its settings, publishes it, and archives it and unarchives it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId: coreId } = await getSeedCtx();
    const rulesets = api.v1.rulesets[":id"];

    const fork = await expectOk(rulesets.fork.$post({ json: { name: "House Rules" }, param: { id: coreId } }));
    expect(fork).toMatchObject({
      name: "House Rules",
      parentId: coreId,
      private: true,
      status: "Draft",
      system: false,
    });
    const { id } = fork;

    const changed = await expectOk(
      rulesets.$put({ json: { description: "Our table's", name: "Table Rules" }, param: { id } }),
    );
    expect(changed).toMatchObject({ description: "Our table's", name: "Table Rules" });
    const renamed = await expectOk(rulesets.$put({ json: { name: "House Rules" }, param: { id } }));
    expect(renamed).toMatchObject({ description: "Our table's", name: "House Rules" });
    await expectStatus(rulesets.$put({ json: { name: "Core SRD 3.5" }, param: { id } }), 409);
    const abilityIncreases = { every: 3, extra: [] };
    const settings = await expectOk(rulesets.settings.$put({ json: { fields: { abilityIncreases } }, param: { id } }));
    expect(settings.fields).toMatchObject({ abilityIncreases });

    expect(await expectOk(rulesets.publish.$post({ json: {}, param: { id } }))).toMatchObject({ status: "Published" });
    await expectStatus(rulesets.archive.$post({ param: { id } }), 204);
    expect(await expectOk(rulesets.unarchive.$post({ param: { id } }))).toMatchObject({ id, status: "Draft" });
  });

  test("subscribes a ruleset to an extension, and unsubscribes it", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { rulesetId: coreId } = await getSeedCtx();
    const [warrior] = await expectOk(api.v1.rulesets[":id"].extensions.$get({ param: { id: coreId } }));
    const extensionId = warrior!.id;
    const extensions = api.v1.rulesets[":id"].extensions;

    expect(await expectOk(extensions.$post({ json: { extensionIds: [extensionId] }, param: { id } }))).toEqual([
      expect.objectContaining({ id: extensionId, name: "Complete Warrior SRD 3.5" }),
    ]);
    await expectStatus(extensions[":extensionId"].$delete({ param: { extensionId, id } }), 204);
    expect(await expectOk(extensions.$get({ param: { id } }))).toEqual([]);
  });

  test("restores an entity a fork changed to its parent's", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { featMap } = await getSeedCtx();
    const featId = featMap["Power Attack"]!;
    await expectOk(
      api.v1.rulesets[":id"].feats[":featId"].$put({ json: { name: "Mighty Blow" }, param: { featId, id } }),
    );
    const changes = api.v1.rulesets[":id"].changes;
    expect(await expectOk(changes.$get({ param: { id } }))).toContainEqual(
      expect.objectContaining({ kind: "feats", sourceId: featId, status: "modified" }),
    );

    const restore = api.v1.rulesets[":id"][":kind"][":entityId"].restore;
    await expectStatus(restore.$post({ param: { entityId: featId, id, kind: "feats" } }), 204);
    expect(await expectOk(changes.$get({ param: { id } }))).toEqual([]);
    expect((await expectOk(api.v1.rulesets[":id"].feats[":featId"].$get({ param: { featId, id } }))).name).toBe(
      "Power Attack",
    );
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    await expectStatus(api.v1.rulesets[":id"].$put({ json: { description: "", name: "Mine" }, param: { id } }), 403);
    await expectStatus(api.v1.rulesets[":id"].settings.$put({ json: { fields: {} }, param: { id } }), 403);
  });
});
