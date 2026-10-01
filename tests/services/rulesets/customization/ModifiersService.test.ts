import { describe, expect, test } from "bun:test";

import { getTableName } from "drizzle-orm";

import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import {
  Abilities,
  Activities,
  Feats,
  Items,
  Modifiers,
  Powers,
  Races,
  Requirements,
} from "@/server/repositories/index.ts";
import { deleteModifiersWithCascade } from "@/server/services/rulesets/cow.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { timingStorage } from "@/server/timing.ts";
import { createTestKlassLevel, createTestUserAndRuleset, NIL_UUID } from "@/tests/helpers.ts";

const strengthBonus = { target: "abilities.strength.misc", value: "2", operator: "add" };

/** A new user's ruleset with a Strength ability, so modifier targets resolve, and one entity of each type that owns modifiers. */
async function setup() {
  const { session, ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  await Abilities.create(db, { name: "Strength", description: "Strength", rulesetId });
  const [[feat], [item], [power], [race], { klassLevel }] = await Promise.all([
    Feats.create(db, { name: "Test Feat", rulesetId }),
    Items.create(db, { name: "Test Item", rulesetId }),
    Powers.create(db, { name: "Test Power", rulesetId }),
    Races.create(db, { name: "Test Race", rulesetId, size: "Medium", baseSpeed: 30 }),
    createTestKlassLevel(rulesetId),
  ]);
  const owners = { feats: feat.id, items: item.id, powers: power.id, races: race.id, klass_levels: klassLevel.id };
  return { session, rulesetId, feat, item, owners };
}

/** The activities logged against a row of `table`, by type. */
async function activityTypes(
  userId: string,
  table: typeof modifiersInCustomization | typeof requirementsInCustomization,
  targetId: string,
) {
  const { items } = await Activities.findMany(
    db,
    { userId, targetTable: getTableName(table) },
    { limit: 100, page: 1 },
  );
  return items.filter((a) => a.targetId === targetId).map((a) => a.type);
}

// The feat modifier routes are covered in the customization modifiers router test.
describe("ModifiersService", () => {
  test("creates, reads, lists, updates and deletes a modifier of every entity type that owns them", async () => {
    const { session, rulesetId, owners } = await setup();
    for (const [entityType, entityId] of Object.entries(owners)) {
      const created = await ModifiersMethods.createEntityModifier(
        session,
        rulesetId,
        entityType,
        entityId,
        strengthBonus,
      );
      expect(created).toMatchObject({
        ...strengthBonus,
        sourceType: entityType,
        sourceId: entityId,
        valueType: "number",
      });

      expect(await ModifiersMethods.getEntityModifiers(rulesetId, entityType, entityId)).toMatchObject([
        { id: created.id, targetLabels: { strength: "Strength" } },
      ]);
      expect(await ModifiersMethods.getEntityModifier(rulesetId, entityType, entityId, created.id)).toMatchObject({
        id: created.id,
        requirements: [],
      });

      const update = { ...strengthBonus, value: "4" };
      expect(
        await ModifiersMethods.updateEntityModifier(session, rulesetId, entityType, entityId, created.id, update),
      ).toMatchObject(update);
      await ModifiersMethods.deleteEntityModifier(session, rulesetId, entityType, entityId, created.id);
      expect(await ModifiersMethods.getEntityModifiers(rulesetId, entityType, entityId)).toEqual([]);
    }
  });

  test("keeps several modifiers on one target", async () => {
    const { session, rulesetId, feat } = await setup();
    for (const value of ["2", "3"])
      await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, { ...strengthBonus, value });
    expect((await ModifiersMethods.getEntityModifiers(rulesetId, "feats", feat.id)).map((m) => m.value).sort()).toEqual(
      ["2", "3"],
    );
  });

  test("refuses an unknown target", async () => {
    const { session, rulesetId, feat } = await setup();
    const invalid = { ...strengthBonus, target: "invalid.path.that.does.not.exist" };
    await expect(ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, invalid)).rejects.toThrow(
      BadRequestError,
    );
    const created = await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, strengthBonus);
    await expect(
      ModifiersMethods.updateEntityModifier(session, rulesetId, "feats", feat.id, created.id, invalid),
    ).rejects.toThrow(BadRequestError);
  });

  test("refuses a missing ruleset, entity or modifier, another entity's modifier and another user", async () => {
    const { session, rulesetId, feat, item } = await setup();
    const { session: other } = await createTestUserAndRuleset();
    const created = await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, strengthBonus);

    await expect(ModifiersMethods.getEntityModifiers(NIL_UUID, "feats", feat.id)).rejects.toThrow(NotFoundError);
    await expect(ModifiersMethods.getEntityModifiers(rulesetId, "feats", NIL_UUID)).rejects.toThrow(NotFoundError);
    await expect(ModifiersMethods.getEntityModifier(rulesetId, "feats", feat.id, NIL_UUID)).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      ModifiersMethods.createEntityModifier(session, rulesetId, "feats", NIL_UUID, strengthBonus),
    ).rejects.toThrow(NotFoundError);
    await expect(
      ModifiersMethods.createEntityModifier(other, rulesetId, "feats", feat.id, strengthBonus),
    ).rejects.toThrow(ForbiddenError);
    for (const change of [
      (s = session, entityId = feat.id, id = created.id) =>
        ModifiersMethods.updateEntityModifier(s, rulesetId, "feats", entityId, id, strengthBonus),
      (s = session, entityId = feat.id, id = created.id) =>
        ModifiersMethods.deleteEntityModifier(s, rulesetId, "feats", entityId, id),
      (s = session, entityId = feat.id, id = created.id) =>
        ModifiersMethods.duplicateEntityModifier(s, rulesetId, "feats", entityId, id, strengthBonus),
    ]) {
      await expect(change(session, feat.id, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(change(session, item.id)).rejects.toThrow(NotFoundError);
      await expect(change(other)).rejects.toThrow(ForbiddenError);
    }
  });

  test("refuses an edit started from a stale copy", async () => {
    const { session, rulesetId, feat } = await setup();
    const created = await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, strengthBonus);
    const edit = (value: string) =>
      ModifiersMethods.updateEntityModifier(session, rulesetId, "feats", feat.id, created.id, {
        ...strengthBonus,
        value,
        updatedAt: created.updatedAt,
      });
    await edit("3");
    await expect(edit("4")).rejects.toThrow(ConflictError);
  });

  test("duplicates a modifier with a copy of its requirement tree", async () => {
    const { session, rulesetId, feat } = await setup();
    const source = await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, strengthBonus);
    await RequirementsMethods.createEntityRequirement(session, rulesetId, "modifiers", source.id, {
      level: "1",
      chainingOperator: "and",
    });
    await RequirementsMethods.createEntityRequirement(session, rulesetId, "modifiers", source.id, {
      level: "1.1",
      target: "combat.bab",
      value: "5",
      operator: "greater_than_or_equal",
    });
    const sourceRequirements = await Requirements.findManyByEntity(db, {
      entityIds: [source.id],
      entityType: "modifiers",
    });

    const copy = await ModifiersMethods.duplicateEntityModifier(session, rulesetId, "feats", feat.id, source.id, {
      ...strengthBonus,
      value: "3",
    });
    expect(copy).toMatchObject({ ...strengthBonus, value: "3", sourceId: feat.id });
    const copied = await Requirements.findManyByEntity(db, { entityIds: [copy.id], entityType: "modifiers" });
    expect(
      copied
        .map(({ level, chainingOperator, target }) => ({ level, chainingOperator, target }))
        .sort((a, b) => a.level.localeCompare(b.level)),
    ).toEqual([
      { level: "1", chainingOperator: "and", target: null },
      { level: "1.1", chainingOperator: null, target: "combat.bab" },
    ]);
    expect(copied.map((r) => r.id)).not.toContain(sourceRequirements[0].id);
    expect(await Requirements.findManyByEntity(db, { entityIds: [source.id], entityType: "modifiers" })).toEqual(
      sourceRequirements,
    );
  });

  describe("deleting a modifier", () => {
    test("deletes its requirements, replaces its activities with the deletion and drops its requirements'", async () => {
      const { session, rulesetId, feat } = await setup();
      const [modifier, sibling] = [
        await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, strengthBonus),
        await ModifiersMethods.createEntityModifier(session, rulesetId, "feats", feat.id, strengthBonus),
      ];
      const group = { level: "1", chainingOperator: "and" } as const;
      const requirements = [
        await RequirementsMethods.createEntityRequirement(session, rulesetId, "modifiers", modifier.id, group),
        await RequirementsMethods.createEntityRequirement(session, rulesetId, "modifiers", sibling.id, group),
      ];

      await ModifiersMethods.deleteEntityModifier(session, rulesetId, "feats", feat.id, modifier.id);

      expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual(
        [],
      );
      expect(await activityTypes(session.userId, modifiersInCustomization, modifier.id)).toEqual(["deleteModifier"]);
      expect(await activityTypes(session.userId, requirementsInCustomization, requirements[0].id)).toEqual([]);
      // The other modifier keeps its requirement.
      expect(
        await Requirements.findManyByEntity(db, { entityIds: [sibling.id], entityType: "modifiers" }),
      ).toMatchObject([{ id: requirements[1].id }]);
    });

    test("stays batched however many modifiers go", async () => {
      const counts: number[] = [];
      for (const width of [1, 40]) {
        const modifiers = await Modifiers.createMany(
          db,
          Array.from({ length: width }, () => ({
            ...strengthBonus,
            sourceId: crypto.randomUUID(),
            sourceType: "feats",
            valueType: "number",
          })),
        );
        const ids = modifiers.map((row) => row.id);
        await Requirements.createMany(
          db,
          ids.map((entityId) => ({ entityId, entityType: "modifiers", level: "1", chainingOperator: "and" })),
        );
        const timing = {
          dbTimeMs: 0,
          queryCount: 0,
          activeQueries: 0,
          dbWallStart: 0,
          slowQueries: [],
          cacheHits: 0,
          cacheMisses: 0,
          dedupHits: 0,
          dedupMisses: 0,
        };
        expect(await timingStorage.run(timing, () => deleteModifiersWithCascade(db, { ids }))).toHaveLength(width);
        counts.push(timing.queryCount);
        expect(await Requirements.findManyByEntity(db, { entityIds: ids, entityType: "modifiers" })).toEqual([]);
      }
      expect(counts[1]).toBe(counts[0]);
    });
  });
});
