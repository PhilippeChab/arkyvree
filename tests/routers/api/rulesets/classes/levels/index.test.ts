import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_DIVINE_NAME } from "@/database/packages/dnd35/names.ts";
import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Klasses, Rulesets } from "@/server/repositories/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const klass = api.api.rulesets[":id"].classes[":classId"];
const levels = klass.levels;
const level = levels[":levelId"];
const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;

/** A seeded fork with a new class. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const created = await expectOk(
    api.api.rulesets[":id"].classes.$post({ param: { id }, json: { name: "Level Class", hd: 10 } }),
  );
  return { id, classId: created.id };
}

describe("rulesets class levels", () => {
  test("creates, reads, lists, updates and deletes a class level", async () => {
    const { id, classId } = await setup();

    const created = await expectOk(levels.$post({ param: { id, classId }, json: { level: 1, bab: 1, skills: 4 } }));
    expect(created).toMatchObject({ level: 1, bab: 1, skills: 4 });
    const param = { id, classId, levelId: created.id };

    expect(await expectOk(level.$get({ param }))).toMatchObject({ id: created.id, level: 1 });
    const byId = await expectOk(
      api.api.rulesets[":id"]["class-levels"][":classLevelId"].$get({ param: { id, classLevelId: created.id } }),
    );
    expect(byId.id).toBe(created.id);
    expect((await expectOk(levels.$get({ param: { id, classId } }))).map((l) => l.id)).toEqual([created.id]);

    // The level number is fixed once created.
    expect(await expectOk(level.$put({ param, json: { bab: 3, skills: 6 } }))).toMatchObject({
      level: 1,
      bab: 3,
      skills: 6,
    });

    await expectOk(level.$delete({ param }));
    expect(await expectOk(levels.$get({ param: { id, classId } }))).toEqual([]);
  });

  test("requires the previous class level from level 2 on", async () => {
    const { id, classId } = await setup();
    const first = await expectOk(levels.$post({ param: { id, classId }, json: { level: 1, bab: 1, skills: 4 } }));
    const fifth = await expectOk(levels.$post({ param: { id, classId }, json: { level: 5, bab: 5, skills: 4 } }));

    const param = (entityId: string) => ({ id, entityType: "class-levels" as const, entityId });
    expect(await expectOk(requirements.$get({ param: param(first.id) }))).toEqual([]);
    expect(await expectOk(requirements.$get({ param: param(fifth.id) }))).toMatchObject([
      { level: "1", valueType: "number", operator: "greater_than", value: "4" },
    ]);
  });

  test("reads a class's spells per day, spells known, feat pools and spell lists", async () => {
    const { klassMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const perDay = await expectOk(klass.spells.$get({ param: { id, classId: klassMap.pc["Wizard"] } }));
    expect(perDay.find((l) => l.level === 1)).toMatchObject({ spellsPerDay: { 0: 3, 1: 1 } });

    const known = await expectOk(klass["spells-known"].$get({ param: { id, classId: klassMap.pc["Sorcerer"] } }));
    expect(known.find((l) => l.level === 1)).toMatchObject({ spellsKnown: { 0: 4, 1: 2 } });

    const pools = await expectOk(klass["feat-pools"].$get({ param: { id, classId: klassMap.pc["Fighter"] } }));
    expect(pools.find((l) => l.level === 1)).toMatchObject({ featPools: { "Fighter Bonus Feat": 1 } });

    const lists = await expectOk(klass["spell-lists"].$get({ param: { id, classId: klassMap.pc["Wizard"] } }));
    expect(lists.map((list) => list.name)).toEqual(["Wizard Spells"]);

    // A class whose levels give slots in no list has none
    expect(await expectOk(klass["spell-lists"].$get({ param: { id, classId: klassMap.pc["Fighter"] } }))).toEqual([]);
  });

  test("lists every spell list a class casts from, its own first: the Pious Templar's and its blackguard one", async () => {
    const divine = (await Rulesets.findOne(db, { name: DND35_COMPLETE_DIVINE_NAME }))!;
    const templar = (await Klasses.findOne(db, { name: "Pious Templar", rulesetId: divine.id }))!;
    const lists = await expectOk(klass["spell-lists"].$get({ param: { id: divine.id, classId: templar.id } }));
    expect(lists.map((list) => list.name)).toEqual(["Pious Templar Spells", "Pious Templar Blackguard Spells"]);
  });

  test("requires a session", async () => {
    const { id, classId } = await setup();
    await expectStatus(guestApi.api.rulesets[":id"].classes[":classId"].levels.$get({ param: { id, classId } }), 401);
  });

  test("rejects a level without a number or out of 1–20", async () => {
    const { id, classId } = await setup();
    for (const json of [
      { bab: 1, skills: 4 },
      { level: "1", bab: 1, skills: 4 },
      { level: 21, bab: 1, skills: 4 },
    ]) {
      await expectStatus(levels.$post({ param: { id, classId }, json: json as never }), 400);
    }
  });

  test("returns 404 for a missing ruleset, class or level", async () => {
    const { id, classId } = await setup();
    await expectStatus(levels.$get({ param: { id: NIL_UUID, classId } }), 404);
    await expectStatus(levels.$get({ param: { id, classId: NIL_UUID } }), 404);
    await expectStatus(klass.spells.$get({ param: { id, classId: NIL_UUID } }), 404);
    const param = { id, classId, levelId: NIL_UUID };
    await expectStatus(level.$get({ param }), 404);
    await expectStatus(level.$put({ param, json: { bab: 1 } }), 404);
    await expectStatus(level.$delete({ param }), 404);
  });
});
