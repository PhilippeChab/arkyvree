import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_DIVINE_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import type { Klass } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { CLASS_HD, CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

const klass = api.api.rulesets[":id"].entities[":entityType"][":entityId"];
const levels = klass.owned;
const level = levels[":ownedId"];
const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;

const table = klass.tables[":table"];

/** A class's route's params: the ruleset, and the class, an entity of the classes' kind. */
function classParam(id: string, classId: string) {
  return { id, entityType: "classes" as const, entityId: classId };
}

/** A seeded fork with a new class. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const created = await expectOk(
    api.api.rulesets[":id"].entities[":entityType"].$post({
      param: { id, entityType: "classes" },
      json: { name: "Level Class", fields: { [CLASS_HD]: 10 } },
    }),
  );
  return { id, classId: created.id };
}

describe("rulesets class levels", () => {
  test("creates, reads, lists, updates and deletes a class level", async () => {
    const { id, classId } = await setup();

    const created = await expectOk(
      levels.$post({
        param: classParam(id, classId),
        json: { fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 }, position: 1 },
      }),
    );
    expect(created).toMatchObject({
      position: 1,
      fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 },
    });
    const param = { ...classParam(id, classId), ownedId: created.id };

    const byId = await expectOk(
      api.api.rulesets[":id"].entities[":entityType"].owned[":ownedId"].$get({
        param: { id, entityType: "classes", ownedId: created.id },
      }),
    );
    expect(byId).toMatchObject({ id: created.id, position: 1 });
    expect((await expectOk(levels.$get({ param: classParam(id, classId) }))).map((l) => l.id)).toEqual([created.id]);

    // The level number is fixed once created.
    const { updatedAt } = created;
    expect(
      await expectOk(
        level.$put({ param, json: { fields: { [CLASS_LEVEL_BAB]: 3, [CLASS_LEVEL_SKILL_POINTS]: 6 }, updatedAt } }),
      ),
    ).toMatchObject({
      position: 1,
      fields: { [CLASS_LEVEL_BAB]: 3, [CLASS_LEVEL_SKILL_POINTS]: 6 },
    });
    // An edit started from the level before that one is stale
    await expectStatus(level.$put({ param, json: { fields: { [CLASS_LEVEL_BAB]: 4 }, updatedAt } }), 409);

    await expectOk(level.$delete({ param }));
    expect(await expectOk(levels.$get({ param: classParam(id, classId) }))).toEqual([]);
  });

  test("writes no requirement of the class's previous level, which the levels' order holds", async () => {
    const { id, classId } = await setup();
    const first = await expectOk(
      levels.$post({
        param: classParam(id, classId),
        json: { fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 }, position: 1 },
      }),
    );
    const fifth = await expectOk(
      levels.$post({
        param: classParam(id, classId),
        json: { fields: { [CLASS_LEVEL_BAB]: 5, [CLASS_LEVEL_SKILL_POINTS]: 4 }, position: 5 },
      }),
    );

    const param = (entityId: string) => ({ id, entityType: "class-levels" as const, entityId });
    expect(await expectOk(requirements.$get({ param: param(first.id) }))).toEqual([]);
    expect(await expectOk(requirements.$get({ param: param(fifth.id) }))).toEqual([]);
  });

  test("reads a class's spells per day, spells known, feat pools and spell lists", async () => {
    const { classMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const read = async (classId: string, name: string) =>
      (await expectOk(table.$get({ param: { ...classParam(id, classId), table: name } }))) as Record<string, unknown>[];
    const firstLevel = (rows: Record<string, unknown>[]) => rows.find((l) => l.position === 1);

    expect(firstLevel(await read(classMap.pc["Wizard"], "spells"))).toMatchObject({ spellsPerDay: { 0: 3, 1: 1 } });
    expect(firstLevel(await read(classMap.pc["Sorcerer"], "spells-known"))).toMatchObject({
      spellsKnown: { 0: 4, 1: 2 },
    });
    expect(firstLevel(await read(classMap.pc["Fighter"], "feat-pools"))).toMatchObject({
      featPools: { "Fighter Bonus Feat": 1 },
    });

    const lists = await read(classMap.pc["Wizard"], "spell-lists");
    expect(lists.map((list) => list.name)).toEqual(["Wizard Spells"]);

    // A class whose levels give slots in no list has none
    expect(await read(classMap.pc["Fighter"], "spell-lists")).toEqual([]);
  });

  test("lists every spell list a class casts from, its own first: the Pious Templar's and its blackguard one", async () => {
    const divine = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
    const templar = (await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Pious Templar",
      rulesetId: divine.id,
    }))!;
    const lists = (await expectOk(
      table.$get({ param: { ...classParam(divine.id, templar.id), table: "spell-lists" } }),
    )) as { name: string }[];
    expect(lists.map((list) => list.name)).toEqual(["Pious Templar Spells", "Pious Templar Blackguard Spells"]);
  });

  test("requires a session", async () => {
    const { id, classId } = await setup();
    const guestLevels = guestApi.api.rulesets[":id"].entities[":entityType"][":entityId"].owned;
    await expectStatus(guestLevels.$get({ param: classParam(id, classId) }), 401);
  });

  test("rejects a level without a number, out of 1–20 or with a key its body doesn't take", async () => {
    const { id, classId } = await setup();
    for (const json of [
      { fields: { [CLASS_LEVEL_BAB]: 1 } },
      { fields: { [CLASS_LEVEL_BAB]: 1 }, position: "1" },
      { fields: { [CLASS_LEVEL_BAB]: 1 }, position: 21 },
    ]) {
      const refused = await expectStatus(levels.$post({ param: classParam(id, classId), json: json as never }), 400);
      expect(await refused.json()).toMatchObject({ issues: [{ category: "position" }] });
    }
    const extra = { fields: { [CLASS_LEVEL_BAB]: 1 }, position: 2, extra: 1 } as never;
    const unknown = await expectStatus(levels.$post({ param: classParam(id, classId), json: extra }), 400);
    expect(await unknown.json()).toMatchObject({
      issues: [{ category: "json", message: 'Unrecognized key: "extra"' }],
    });
  });

  test("refuses a level its class already has, written since its view was read too", async () => {
    const { id, classId } = await setup();
    const post = (position: number) =>
      levels.$post({ param: classParam(id, classId), json: { fields: { [CLASS_LEVEL_BAB]: 1 }, position } });
    await expectOk(post(3));
    expect(await (await expectStatus(post(3), 409)).json()).toMatchObject({
      message: "Level Class already has a level 3",
    });

    // An inherited class's levels are its fork's: no copy of it is made
    const { classMap } = await getSeedCtx();
    const fighter = classParam(id, classMap.pc["Fighter"]);
    const inherited = levels.$post({ param: fighter, json: { fields: { [CLASS_LEVEL_BAB]: 3 }, position: 3 } });
    expect(await (await expectStatus(inherited, 409)).json()).toMatchObject({
      message: "Fighter already has a level 3",
    });
    expect(await Entities.findOne(db, { entityType: "classes", name: "Fighter", rulesetId: id })).toBeUndefined();

    // A level another save wrote after the view was read (the view cached without it) meets the database's index
    await Entities.create(db, "class-levels", { ownerId: classId, position: 4 });
    expect(await (await expectStatus(post(4), 409)).json()).toMatchObject({
      message: "Level Class already has a level 4",
    });

    // And on an inherited class: a level its source got after the fork's view was read meets the index on its copy
    const fork = await createTestRuleset(SEED_USER_ID, { rulesetId: id });
    await expectOk(levels.$get({ param: classParam(fork.id, classId) }));
    await Entities.create(db, "class-levels", { ownerId: classId, position: 5 });
    const raced = levels.$post({
      param: classParam(fork.id, classId),
      json: { fields: { [CLASS_LEVEL_BAB]: 5 }, position: 5 },
    });
    expect(await (await expectStatus(raced, 409)).json()).toMatchObject({
      message: "Level Class already has a level 5",
    });
  });

  test("returns 404 for a missing ruleset, class or level, a class or a level named in its rules' word", async () => {
    const { id, classId } = await setup();
    const missing = (word: string) => ({ message: `${word} not found in this ruleset` });
    await expectStatus(levels.$get({ param: classParam(NIL_UUID, classId) }), 404);
    expect(await (await expectStatus(levels.$get({ param: classParam(id, NIL_UUID) }), 404)).json()).toMatchObject(
      missing("Class"),
    );
    await expectStatus(table.$get({ param: { ...classParam(id, NIL_UUID), table: "spells" } }), 404);
    const param = { ...classParam(id, classId), ownedId: NIL_UUID };
    const byId = api.api.rulesets[":id"].entities[":entityType"].owned[":ownedId"];
    // "Class level", its word "Class Level" in a sentence's case
    const read = byId.$get({ param: { id, entityType: "classes", ownedId: NIL_UUID } });
    expect(await (await expectStatus(read, 404)).json()).toMatchObject(missing("Class level"));
    const update = level.$put({ param, json: { fields: { [CLASS_LEVEL_BAB]: 1 } } });
    expect(await (await expectStatus(update, 404)).json()).toMatchObject(missing("Class level"));
    await expectStatus(level.$delete({ param }), 404);
  });
});
