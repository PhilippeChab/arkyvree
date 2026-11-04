import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { addBaseBonuses } from "@/tests/support/dnd3.5/links.ts";
import { linksOf } from "@/tests/support/entityLinks.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const progression = kinds[":entityId"].progression;

/** A class's first level as its route answers it (`param`, the class's): its id, its token, its fields and its saves. */
async function firstLevelOf(param: { entityId: string; entityType: "classes"; id: string }) {
  const level = (await expectOk(kinds[":entityId"].owned.$get({ param }))).find(({ position }) => position === 1)!;
  const saves = linksOf(level, "baseBonus").map(({ amount }) => amount);
  return { ...level, bab: level.fields[CLASS_LEVEL_BAB], saves, skills: level.fields[CLASS_LEVEL_SKILL_POINTS] };
}

/** A seeded fork and its inherited wizard, with its levels. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const listed = await expectOk(kinds.$get({ param: { id, entityType: "classes" }, query: { search: "Wizard" } }));
  const wizard = listed.items.find((row) => row.name === "Wizard")!;
  const param = { id, entityType: "classes" as const, entityId: wizard.id };
  const levels = await expectOk(kinds[":entityId"].owned.$get({ param }));
  return { param, wizard, levels };
}

describe("rulesets class progression", () => {
  test("answers a class's pools and spell list, and a save that changes nothing writes nothing", async () => {
    const { param, wizard } = await setup();

    const read = await expectOk(progression.$get({ param }));
    expect(read.spellList?.name).toBe("Wizard Spells");
    expect(read.pools.map((pool) => pool.name)).toContain("Wizard Specialization");

    expect(await expectOk(progression.$put({ param, json: {} }))).toEqual({
      entityId: wizard.id,
      ownedIds: [],
      updatedAt: wizard.updatedAt,
    });
  });

  test("creates a feature of the class in its own pool, refusing a name the ruleset has, and a guest", async () => {
    const { param } = await setup();
    // What the name creates, as the picker offers it, before and after
    expect(await expectOk(progression.features.$get({ param, query: { name: "Arcane Ward" } }))).toEqual({
      exists: false,
      name: "Arcane Ward (Wizard)",
    });

    const response = await expectStatus(progression.features.$post({ param, json: { name: "Arcane Ward" } }), 201);
    const created = await response.json();
    expect(created).toMatchObject({
      name: "Arcane Ward (Wizard)",
      stacks: false,
      via: { name: "Wizard Class Feature" },
    });
    // The ruleset's view lists it among the wizard's features now
    RulesetViews.invalidate(param.id);
    const read = await expectOk(progression.$get({ param }));
    expect(read.featurePools.map((pool) => pool.name)).toContain("Wizard Class Feature");

    expect(await expectOk(progression.features.$get({ param, query: { name: "Arcane Ward" } }))).toEqual({
      exists: true,
      name: "Arcane Ward (Wizard)",
    });
    await expectStatus(progression.features.$post({ param, json: { name: "Arcane Ward" } }), 409);
    await expectStatus(
      guestApi.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.features.$post({
        param,
        json: { name: "Ward" },
      }),
      401,
    );
  });

  test("saves a level's fields on the fork's copy of an inherited class, and answers the levels it wrote", async () => {
    const { param, wizard, levels } = await setup();
    const first = levels.find((level) => level.position === 1)!;

    const saved = await expectOk(
      progression.$put({
        param,
        json: {
          owned: [{ ownedId: first.id, fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 } }],
          ownedTokens: [{ id: first.id, updatedAt: first.updatedAt }],
        },
      }),
    );

    expect(saved.entityId).not.toBe(wizard.id);
    const copied = await expectOk(progression.$get({ param: { ...param, entityId: saved.entityId } }));
    expect(copied.spellList?.name).toBe("Wizard Spells");
    expect(saved.ownedIds).toHaveLength(1);
  });

  test("takes no base attack bonus, saves or skill points on a bonded creature's class's levels: refuses one set, by field, and leaves none, whatever a level held", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const query = { search: "Familiar", partition: "familiar" };
    const familiar = (await expectOk(kinds.$get({ param: { id, entityType: "classes" }, query }))).items[0];
    const saveIds = (await expectOk(kinds.$get({ param: { id, entityType: "saves" }, query: {} }))).items.map(
      (save) => save.id,
    );
    // A save of its first level's fields and of a bonus to each save, as the Progression tab sends a level it changed
    const save = (classId: string, level: { id: string; updatedAt: string }, value: number) =>
      progression.$put({
        param: { id, entityType: "classes", entityId: classId },
        json: {
          owned: [
            {
              ownedId: level.id,
              fields: { [CLASS_LEVEL_BAB]: value, [CLASS_LEVEL_SKILL_POINTS]: value },
              links: { baseBonus: saveIds.map((toId) => ({ toId, amount: value })) },
            },
          ],
          ownedTokens: [{ id: level.id, updatedAt: level.updatedAt }],
        },
      });
    const first = await firstLevelOf({ id, entityType: "classes", entityId: familiar.id });
    expect(first).toMatchObject({ bab: 0, saves: [], skills: 0 });

    const refused = await expectStatus(save(familiar.id, first, 2), 400);
    const sheet = "which the creature's sheet works out";
    expect(await refused.json()).toMatchObject({
      issues: [
        { category: `fields.${CLASS_LEVEL_BAB}`, message: `Familiar levels give no base attack bonus, ${sheet}` },
        { category: `fields.${CLASS_LEVEL_SKILL_POINTS}`, message: `Familiar levels give no skill points, ${sheet}` },
        ...saveIds.map((_, index) => ({
          category: `links.baseBonus.${index}.amount`,
          message: `Familiar levels give no saves, ${sheet}`,
        })),
      ],
    });
    // So is its own form's
    const level = kinds[":entityId"].owned[":ownedId"];
    const ownParam = { id, entityType: "classes" as const, entityId: familiar.id, ownedId: first.id };
    await expectStatus(level.$put({ param: ownParam, json: { fields: { [CLASS_LEVEL_BAB]: 2 } } }), 400);
    await expectStatus(level.$put({ param: ownParam, json: { fields: { [CLASS_LEVEL_SKILL_POINTS]: 2 } } }), 400);

    // None of them, as a read gives them, saves
    const saved = await expectOk(save(familiar.id, first, 0));
    const copied = await firstLevelOf({ id, entityType: "classes", entityId: saved.entityId });
    expect(copied).toMatchObject({ bab: 0, saves: [], skills: 0 });

    // A level that holds them, an older save's, takes them back as read, and holds none once saved
    const olderFields = { [CLASS_LEVEL_BAB]: 3, [CLASS_LEVEL_SKILL_POINTS]: 3 };
    await Entities.update(db, "class-levels", { fields: olderFields }, { id: copied.id });
    await addBaseBonuses(
      db,
      copied.id,
      saveIds.map((toId) => ({ toId, amount: 3 })),
    );
    RulesetViews.invalidate(id);
    const held = await firstLevelOf({ id, entityType: "classes", entityId: saved.entityId });
    expect(held).toMatchObject({ bab: 3, saves: saveIds.map(() => 3), skills: 3 });
    await expectOk(save(saved.entityId, held, 3));
    expect(await firstLevelOf({ id, entityType: "classes", entityId: saved.entityId })).toMatchObject({
      bab: 0,
      saves: [],
      skills: 0,
    });
  });

  test("refuses a body that isn't a save, as its rules read it, and a guest", async () => {
    const { param, levels } = await setup();
    const [first] = levels;
    for (const json of [
      [],
      null,
      { owned: "all" },
      { owned: [{ ownedId: "not-an-id" }] },
      { owned: [{ ownedId: first.id, fields: 1 }] },
      { pools: [{ id: first.id }] },
      { ownedTokens: [{ id: "not-an-id", updatedAt: first.updatedAt }] },
    ])
      await expectStatus(progression.$put({ param, json: json as never }), 400);

    const guest = guestApi.api.rulesets[":id"].entities[":entityType"][":entityId"].progression;
    await expectStatus(guest.$put({ param, json: {} }), 401);
  });

  test("reads a body by its rules once the access check and the class's lookup pass", async () => {
    const { param } = await setup();
    const json = { owned: "all" } as never;
    // A private fork isn't revealed to a stranger
    const { api: other } = await createSignedInUser();
    await expectStatus(
      other.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.$put({ param, json }),
      404,
    );
    await expectStatus(progression.$put({ param: { ...param, entityId: NIL_UUID }, json }), 404);
  });

  test("answers what a save would leave a class's spell tables at, by their names, refusing what isn't one", async () => {
    const { param, wizard, levels } = await setup();
    const first = levels.find((level) => level.position === 1)!;

    const planned = await expectOk(
      progression.plan.$post({ param, json: { spells: { perDay: [{ ownedId: first.id, counts: [5, 2] }] } } }),
    );
    // Each table its tables' tab edits, by its name, as its route reads it once saved, and no feature giving nothing
    expect(Object.keys(planned.tables).toSorted()).toEqual(["spells", "spells-known"]);
    expect(planned.tables.spells?.find((level) => "position" in level && level.position === 1)).toMatchObject({
      spellsPerDay: { 0: 5, 1: 2 },
    });
    expect(planned.tables["spells-known"]?.length).toBe(levels.length);
    expect(planned.featureNotes.flatMap((note) => note.idle)).toEqual([]);
    // Nothing written: the fork's wizard is the one it inherits, as it was
    expect((await expectOk(kinds[":entityId"].$get({ param }))).updatedAt).toBe(wizard.updatedAt);
    const perDay = await expectOk(kinds[":entityId"].tables[":table"].$get({ param: { ...param, table: "spells" } }));
    expect(perDay.find((level) => "position" in level && level.position === 1)).toMatchObject({
      spellsPerDay: { 0: 3, 1: 1 },
    });

    for (const json of [[], { owned: "all" }, { spells: { perDay: [{ ownedId: "not-an-id", counts: [] }] } }])
      await expectStatus(progression.plan.$post({ param, json: json as never }), 400);
    const guest = guestApi.api.rulesets[":id"].entities[":entityType"][":entityId"].progression;
    await expectStatus(guest.plan.$post({ param, json: {} }), 401);
    const { api: other } = await createSignedInUser();
    await expectStatus(
      other.api.rulesets[":id"].entities[":entityType"][":entityId"].progression.plan.$post({ param, json: {} }),
      404,
    );
  });
});
