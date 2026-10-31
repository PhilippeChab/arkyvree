import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A new user's key, and a fork of the seeded ruleset of theirs. */
async function keyedFork() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const fork = await createSeededTestRuleset(user.id);
  return { api, fork, id: fork.id, rulesets: api.v1.rulesets[":id"] };
}

describe("v1 ruleset writes", () => {
  test("forks a ruleset, updates it, refusing a stale update, stars it and archives it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId } = await getSeedCtx();
    const rulesets = api.v1.rulesets[":id"];

    const json = { description: "A keyed fork", name: `Keyed Fork ${crypto.randomUUID()}`, private: true };
    const fork = await expectOk(rulesets.fork.$post({ json, param: { id: rulesetId } }));
    expect(fork).toMatchObject({ name: json.name, parentId: rulesetId, private: true });

    const param = { id: fork.id };
    const updated = await expectOk(
      rulesets.$put({ json: { description: "Renamed", name: json.name, updatedAt: fork.updatedAt }, param }),
    );
    expect(updated.description).toBe("Renamed");
    await expectStatus(
      rulesets.$put({ json: { description: "Stale", name: json.name, updatedAt: fork.updatedAt }, param }),
      409,
    );

    expect((await expectOk(rulesets.star.$post({ param: { id: rulesetId } }))).starred).toBe(true);
    expect((await expectOk(rulesets.star.$delete({ param: { id: rulesetId } }))).starred).toBe(false);
    await expectStatus(rulesets.$delete({ param }), 204);
    expect((await expectOk(rulesets.unarchive.$post({ param }))).status).not.toBe("Archived");
  });

  test("publishes a ruleset", async () => {
    const { id, rulesets } = await keyedFork();
    expect(await expectOk(rulesets.publish.$post({ json: {}, param: { id } }))).toMatchObject({
      id,
      status: "Published",
    });
  });

  test("gives a modifier requirements, which say when it applies", async () => {
    const { id, rulesets } = await keyedFork();
    const { aptMap } = await getSeedCtx();
    const feat = await expectOk(
      rulesets.entities[":kind"].$post({
        json: { links: { listedIn: [{ toId: aptMap.General! }] }, name: "Keyed Feat" },
        param: { id, kind: "feats" },
      }),
    );
    const json = { operator: "add", target: "abilities.strength.misc", value: "2" };
    const customization = rulesets.customization[":kind"][":entityId"];
    const [modifier] = await expectOk(
      customization.modifiers.$post({ json, param: { entityId: feat.id, id, kind: "feats" } }),
    );
    const param = { entityId: modifier!.id, id, kind: "modifiers" as const };
    expect(
      await expectOk(customization.requirements.$post({ json: { chainingOperator: "and", level: "0" }, param })),
    ).toEqual([expect.objectContaining({ chainingOperator: "and" })]);
    expect(await expectOk(customization.requirements.$get({ param }))).toHaveLength(1);
  });

  test("updates a ruleset's settings", async () => {
    const { id, rulesets } = await keyedFork();
    const { abilityMap } = await getSeedCtx();
    const settings = await expectOk(
      rulesets.settings.$put({ json: { links: { skillPointAbility: abilityMap.Wisdom! } }, param: { id } }),
    );
    expect(settings.links).toMatchObject({ skillPointAbility: abilityMap.Wisdom });
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

  test("edits an inherited entity as the fork's copy, and restores it to its parent's", async () => {
    const { id, rulesets } = await keyedFork();
    const { featMap } = await getSeedCtx();
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" as const };
    const inherited = await expectOk(rulesets.entities[":kind"][":entityId"].$get({ param }));

    const edited = await expectOk(
      rulesets.entities[":kind"][":entityId"].$put({
        json: { description: "Hit harder", name: inherited.name },
        param,
      }),
    );
    expect(edited.description).toBe("Hit harder");
    const changes = await expectOk(rulesets.changes.$get({ param: { id } }));
    const change = changes.find(({ kind, status }) => kind === "feats" && status === "modified");
    expect(change).toMatchObject({ entityId: edited.id, sourceId: param.entityId });
    // Restored by the parent's id, which the fork's entity keeps showing as
    const restored = await expectOk(rulesets.entities[":kind"][":entityId"].restore.$post({ param }));
    expect(restored).toEqual([]);
  });

  test("adds a modifier and a requirement to an entity, updates and removes them", async () => {
    const { id, rulesets } = await keyedFork();
    const { aptMap } = await getSeedCtx();
    const created = await expectOk(
      rulesets.entities[":kind"].$post({
        json: { links: { listedIn: [{ toId: aptMap.General! }] }, name: "Keyed Feat" },
        param: { id, kind: "feats" },
      }),
    );
    const customization = rulesets.customization[":kind"][":entityId"];
    const param = { entityId: created.id, id, kind: "feats" as const };

    const json = { operator: "add", target: "abilities.strength.misc", value: "2" };
    const [modifier] = await expectOk(customization.modifiers.$post({ json, param }));
    expect(modifier).toMatchObject({ target: "abilities.strength.misc", value: "2" });
    const modifierParam = { ...param, modifierId: modifier!.id };
    const [updated] = await expectOk(
      customization.modifiers[":modifierId"].$put({ json: { ...json, value: "3" }, param: modifierParam }),
    );
    expect(updated?.value).toBe("3");
    await expectStatus(customization.modifiers[":modifierId"].$delete({ param: modifierParam }), 204);

    const requirements = await expectOk(
      customization.requirements.$post({ json: { chainingOperator: "and", level: "0" }, param }),
    );
    expect(requirements).toEqual([expect.objectContaining({ chainingOperator: "and" })]);
    const requirementParam = { ...param, requirementId: requirements[0]!.id };
    await expectStatus(customization.requirements[":requirementId"].$delete({ param: requirementParam }), 204);
  });

  test("completes and validates a target path", async () => {
    const { id, rulesets } = await keyedFork();
    const paths = rulesets.customization.target.paths;
    const completions = await expectOk(
      paths.completions.$post({ json: { kind: "modifier", partialPath: "abil", position: 4 }, param: { id } }),
    );
    expect(completions.items.length).toBeGreaterThan(0);
    const valid = await expectOk(
      paths.validate.$post({ json: { kind: "modifier", path: "abilities.strength.misc" }, param: { id } }),
    );
    expect(valid.isValid).toBe(true);
  });
});
