import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const lists = kinds[":entityId"].lists[":listId"];

/** The names of the spells on a list at a level, as the class's Spell List tab reads them. */
async function namesOn(id: string, listId: string, tier: number) {
  const query = { listedIn: listId, tier: String(tier), limit: "100" };
  const page = await expectOk(kinds.$get({ param: { id, entityType: "spells" }, query }));
  return page.items.map((spell) => spell.name);
}

/** A seeded fork, its inherited Wizard's spell list, and a seeded spell's id by name, through the API. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const find = async (entityType: "classes" | "spells", name: string) =>
    (await expectOk(kinds.$get({ param: { id, entityType }, query: { search: name } }))).items.find(
      (row) => row.name === name,
    )!.id;
  const wizard = await find("classes", "Wizard");
  const param = { id, entityType: "classes" as const, entityId: wizard };
  const [list] = await expectOk(
    kinds[":entityId"].tables[":table"].$get({ param: { ...param, table: "spell-lists" } }),
  );
  return { id, find, param: { ...param, listId: String(list.id) } };
}

describe("rulesets class spell lists", () => {
  test("adds spells to a class's list at a spell level, and removes one", async () => {
    const { id, find, param } = await setup();
    const [bless, cure] = [await find("spells", "Bless"), await find("spells", "Cure Light Wounds")];

    const added = await expectOk(lists.$post({ param, json: { targetIds: [bless, cure], tier: 1 } }));
    expect(added.map((spell) => spell.name)).toEqual(["Bless", "Cure Light Wounds"]);
    expect(await namesOn(id, param.listId, 1)).toEqual(expect.arrayContaining(["Bless", "Cure Light Wounds"]));

    const removed = await expectOk(lists[":targetId"].$delete({ param: { ...param, targetId: bless } }));
    expect(removed.name).toBe("Bless");
    expect(await namesOn(id, param.listId, 1)).not.toContain("Bless");

    // Its activity opens the inherited class in the fork, given the ruleset it recorded writing
    const resolve = api.api.activities.resolve[":targetType"][":targetId"];
    const target = { targetType: "classes", targetId: param.entityId };
    expect(await expectOk(resolve.$get({ param: target, query: { rulesetId: id } }))).toEqual({
      url: `/rulesets/${id}/classes/${param.entityId}`,
    });
  });

  test("makes a new class's own list on its first add, which its Spell List then shows", async () => {
    const { id, find } = await setup();
    const witch = await expectOk(
      kinds.$post({ param: { id, entityType: "classes" }, json: { name: "Witch", fields: { [CLASS_HD]: 6 } } }),
    );
    const param = { id, entityType: "classes" as const, entityId: witch.id };
    const tables = kinds[":entityId"].tables[":table"];
    expect(await expectOk(tables.$get({ param: { ...param, table: "spell-lists" } }))).toEqual([]);

    const bless = await find("spells", "Bless");
    await expectOk(kinds[":entityId"].lists.$post({ param, json: { targetIds: [bless], tier: 1 } }));
    const [list] = await expectOk(tables.$get({ param: { ...param, table: "spell-lists" } }));
    expect(list).toMatchObject({ name: "Witch Spells" });
    expect(await namesOn(id, String(list.id), 1)).toEqual(["Bless"]);
  });

  test("makes a class's own list with no spells, refusing one the ruleset has", async () => {
    const { id, find } = await setup();
    const param = { id, entityType: "classes" as const, entityId: await find("classes", "Fighter") };
    const own = kinds[":entityId"].lists.own;

    const response = await expectStatus(own.$post({ param }), 201);
    expect(await response.json()).toMatchObject({ name: "Fighter Spells", type: "aptitudes" });
    const [list] = await expectOk(
      kinds[":entityId"].tables[":table"].$get({ param: { ...param, table: "spell-lists" } }),
    );
    expect(list).toMatchObject({ name: "Fighter Spells" });
    const again = await expectStatus(own.$post({ param }), 409);
    expect(await again.json()).toMatchObject({ message: "Fighter Spells already exists" });
  });

  test("refuses an empty add, a level past the rules' bounds, a spell already on the list, and a kind without lists", async () => {
    const { find, param } = await setup();
    const [bless, fireball] = [await find("spells", "Bless"), await find("spells", "Fireball")];

    await expectStatus(lists.$post({ param, json: { targetIds: [], tier: 1 } }), 400);
    // 200 at most in one save
    const tooMany = Array.from({ length: 201 }, () => crypto.randomUUID());
    const capped = await expectStatus(lists.$post({ param, json: { targetIds: tooMany, tier: 1 } }), 400);
    expect(await capped.json()).toMatchObject({ issues: [{ category: "targetIds" }] });
    const past = await expectStatus(lists.$post({ param, json: { targetIds: [bless], tier: 10 } }), 400);
    expect(await past.json()).toMatchObject({ issues: [{ category: "tier" }] });
    const listed = await expectStatus(lists.$post({ param, json: { targetIds: [fireball], tier: 3 } }), 409);
    expect(await listed.json()).toMatchObject({ message: "Fireball is already on Wizard Spells" });
    await expectStatus(lists.$post({ param: { ...param, entityType: "races" }, json: { targetIds: [bless] } }), 404);
    await expectStatus(lists[":targetId"].$delete({ param: { ...param, targetId: bless } }), 404);
  });
});
