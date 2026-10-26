import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_DIVINE_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import type { Klass } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

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
      json: { name: "Level Class", hd: 10 },
    }),
  );
  return { id, classId: created.id };
}

describe("rulesets class levels", () => {
  test("creates, reads, lists, updates and deletes a class level", async () => {
    const { id, classId } = await setup();

    const created = await expectOk(
      levels.$post({ param: classParam(id, classId), json: { level: 1, fields: { bab: 1, skills: 4 } } }),
    );
    expect(created).toMatchObject({ position: 1, bab: 1, skills: 4 });
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
    expect(await expectOk(level.$put({ param, json: { fields: { bab: 3, skills: 6 }, updatedAt } }))).toMatchObject({
      position: 1,
      bab: 3,
      skills: 6,
    });
    // An edit started from the level before that one is stale
    await expectStatus(level.$put({ param, json: { fields: { bab: 4 }, updatedAt } }), 409);

    await expectOk(level.$delete({ param }));
    expect(await expectOk(levels.$get({ param: classParam(id, classId) }))).toEqual([]);
  });

  test("requires the previous class level from level 2 on", async () => {
    const { id, classId } = await setup();
    const first = await expectOk(
      levels.$post({ param: classParam(id, classId), json: { level: 1, fields: { bab: 1, skills: 4 } } }),
    );
    const fifth = await expectOk(
      levels.$post({ param: classParam(id, classId), json: { level: 5, fields: { bab: 5, skills: 4 } } }),
    );

    const param = (entityId: string) => ({ id, entityType: "class-levels" as const, entityId });
    expect(await expectOk(requirements.$get({ param: param(first.id) }))).toEqual([]);
    expect(await expectOk(requirements.$get({ param: param(fifth.id) }))).toMatchObject([
      { level: "1", valueType: "number", operator: "greater_than", value: "4" },
    ]);
  });

  test("reads a class's spells per day, spells known, feat pools and spell lists", async () => {
    const { klassMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const read = async (classId: string, name: string) =>
      (await expectOk(table.$get({ param: { ...classParam(id, classId), table: name } }))) as Record<string, unknown>[];
    const firstLevel = (rows: Record<string, unknown>[]) => rows.find((l) => l.position === 1);

    expect(firstLevel(await read(klassMap.pc["Wizard"], "spells"))).toMatchObject({ spellsPerDay: { 0: 3, 1: 1 } });
    expect(firstLevel(await read(klassMap.pc["Sorcerer"], "spells-known"))).toMatchObject({
      spellsKnown: { 0: 4, 1: 2 },
    });
    expect(firstLevel(await read(klassMap.pc["Fighter"], "feat-pools"))).toMatchObject({
      featPools: { "Fighter Bonus Feat": 1 },
    });

    const lists = await read(klassMap.pc["Wizard"], "spell-lists");
    expect(lists.map((list) => list.name)).toEqual(["Wizard Spells"]);

    // A class whose levels give slots in no list has none
    expect(await read(klassMap.pc["Fighter"], "spell-lists")).toEqual([]);
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

  test("rejects a level without a number or out of 1–20", async () => {
    const { id, classId } = await setup();
    for (const json of [
      { bab: 1, skills: 4 },
      { level: "1", bab: 1, skills: 4 },
      { level: 21, bab: 1, skills: 4 },
    ])
      await expectStatus(levels.$post({ param: classParam(id, classId), json: json as never }), 400);
  });

  test("returns 404 for a missing ruleset, class or level", async () => {
    const { id, classId } = await setup();
    await expectStatus(levels.$get({ param: classParam(NIL_UUID, classId) }), 404);
    await expectStatus(levels.$get({ param: classParam(id, NIL_UUID) }), 404);
    await expectStatus(table.$get({ param: { ...classParam(id, NIL_UUID), table: "spells" } }), 404);
    const param = { ...classParam(id, classId), ownedId: NIL_UUID };
    const byId = api.api.rulesets[":id"].entities[":entityType"].owned[":ownedId"];
    await expectStatus(byId.$get({ param: { id, entityType: "classes", ownedId: NIL_UUID } }), 404);
    await expectStatus(level.$put({ param, json: { fields: { bab: 1 } } }), 404);
    await expectStatus(level.$delete({ param }), 404);
  });
});
