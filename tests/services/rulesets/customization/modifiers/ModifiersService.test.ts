import { describe, expect, test } from "bun:test";

import { modifiersInCustomization, powersAptitudesInRules, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Abilities, Aptitudes, Feats, Items, Powers, Races, Requirements } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createTestKlassLevel } from "@/tests/support/levels.ts";
import { createTestUserAndRuleset, readTargetPaths } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const strengthBonus = { target: "abilities.strength.misc", value: "2", operator: "add" };

/** A new user's ruleset with a Strength ability, so modifier targets resolve, and one entity of each type that owns modifiers. */
async function setup() {
  const { session, ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  await Abilities.create(db, { name: "Strength", description: "Strength", rulesetId });
  const [feat] = await Feats.create(db, { name: "Test Feat", rulesetId });
  const [item] = await Items.create(db, { name: "Test Item", rulesetId });
  const [power] = await Powers.create(db, { name: "Test Power", rulesetId });
  const [race] = await Races.create(db, { name: "Test Race", rulesetId, size: "Medium", baseSpeed: 30 });
  const { klassLevel } = await createTestKlassLevel(rulesetId);
  const owners = { feats: feat.id, items: item.id, powers: power.id, races: race.id, klass_levels: klassLevel.id };
  return { session, rulesetId, feat, item, owners };
}

// The feat modifier routes are covered in the customization modifiers router test.
describe("ModifiersService", () => {
  test("creates, reads, lists, updates and deletes a modifier of every entity type that owns them", async () => {
    const { session, rulesetId, owners } = await setup();
    for (const [entityType, entityId] of Object.entries(owners)) {
      const created = await ModifiersService.createModifier(session, rulesetId, entityType, entityId, strengthBonus);
      expect(created).toMatchObject({
        ...strengthBonus,
        sourceType: entityType,
        sourceId: entityId,
        valueType: "number",
      });

      expect(await ModifiersService.getModifiers(rulesetId, entityType, entityId)).toMatchObject([
        { id: created.id, targetLabels: { strength: "Strength" } },
      ]);
      expect(await ModifiersService.getModifier(rulesetId, entityType, entityId, created.id)).toMatchObject({
        id: created.id,
        requirements: [],
      });

      const update = { ...strengthBonus, value: "4" };
      expect(
        await ModifiersService.updateModifier(session, rulesetId, entityType, entityId, created.id, update),
      ).toMatchObject(update);
      await ModifiersService.deleteModifier(session, rulesetId, entityType, entityId, created.id);
      expect(await ModifiersService.getModifiers(rulesetId, entityType, entityId)).toEqual([]);
    }
  });

  test("refreshes the target paths a list's slots decide: a feat's list has no known paths", async () => {
    // A spell list with a spell; a feat giving it slots makes it the feat's, its spells no longer learned
    const { session, rulesetId, feat } = await setup();
    const [list] = await Aptitudes.create(db, { name: "Test Light Spells", rulesetId });
    const [spell] = await Powers.create(db, { name: "Test Glow", rulesetId });
    await insertRows(powersAptitudesInRules, [{ powerId: spell.id, aptitudeId: list.id, level: 1 }]);
    const knownPath = async () =>
      (await readTargetPaths(rulesetId, "requirement")).paths.some(
        (path) => path.path === "powers.testglow.testlight.known",
      );
    expect(await knownPath()).toBe(true);

    const slot = { target: "aptitudes.testlightspells.1.uses", value: "1", operator: "add" };
    const created = await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, slot);
    expect(await knownPath()).toBe(false);
    await ModifiersService.deleteModifier(session, rulesetId, "feats", feat.id, created.id);
    expect(await knownPath()).toBe(true);
  });

  test("keeps several modifiers on one target", async () => {
    const { session, rulesetId, feat } = await setup();
    for (const value of ["2", "3"])
      await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, { ...strengthBonus, value });
    expect((await ModifiersService.getModifiers(rulesetId, "feats", feat.id)).map((m) => m.value).sort()).toEqual([
      "2",
      "3",
    ]);
  });

  test("stores a number as the sheet reads it, a template as written", async () => {
    const { session, rulesetId, feat } = await setup();
    const created = await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, {
      ...strengthBonus,
      value: "02",
    });
    expect(created.value).toBe("2");
    const update = { ...strengthBonus, value: " 1.50" };
    expect(
      await ModifiersService.updateModifier(session, rulesetId, "feats", feat.id, created.id, update),
    ).toMatchObject({ value: "1.5" });
    const template = { ...strengthBonus, value: "{{ [abilities.strength.modifier] }}" };
    expect(
      await ModifiersService.updateModifier(session, rulesetId, "feats", feat.id, created.id, template),
    ).toMatchObject({ value: template.value });
  });

  test("refuses an unknown target", async () => {
    const { session, rulesetId, feat } = await setup();
    const invalid = { ...strengthBonus, target: "invalid.path.that.does.not.exist" };
    expect(ModifiersService.createModifier(session, rulesetId, "feats", feat.id, invalid)).rejects.toMatchObject({
      refusal: "invalid",
    });
    const created = await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, strengthBonus);
    expect(
      ModifiersService.updateModifier(session, rulesetId, "feats", feat.id, created.id, invalid),
    ).rejects.toMatchObject({ refusal: "invalid" });
  });

  test("refuses a missing ruleset, entity or modifier, another entity's modifier and another user", async () => {
    const { session, rulesetId, feat, item } = await setup();
    const { session: other } = await createTestUserAndRuleset();
    const created = await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, strengthBonus);

    await expectRefusedWith(ModifiersService.getModifiers(NIL_UUID, "feats", feat.id), 404);
    await expectRefusedWith(ModifiersService.getModifiers(rulesetId, "feats", NIL_UUID), 404);
    await expectRefusedWith(ModifiersService.getModifier(rulesetId, "feats", feat.id, NIL_UUID), 404);
    await expectRefusedWith(ModifiersService.createModifier(session, rulesetId, "feats", NIL_UUID, strengthBonus), 404);
    expect(ModifiersService.createModifier(other, rulesetId, "feats", feat.id, strengthBonus)).rejects.toThrow(
      ForbiddenError,
    );
    for (const change of [
      (s = session, entityId = feat.id, id = created.id) =>
        ModifiersService.updateModifier(s, rulesetId, "feats", entityId, id, strengthBonus),
      (s = session, entityId = feat.id, id = created.id) =>
        ModifiersService.deleteModifier(s, rulesetId, "feats", entityId, id),
      (s = session, entityId = feat.id, id = created.id) =>
        ModifiersService.duplicateModifier(s, rulesetId, "feats", entityId, id, strengthBonus),
    ]) {
      await expectRefusedWith(change(session, feat.id, NIL_UUID), 404);
      await expectRefusedWith(change(session, item.id), 404);
      expect(change(other)).rejects.toThrow(ForbiddenError);
    }
  });

  test("refuses an edit started from a stale copy", async () => {
    const { session, rulesetId, feat } = await setup();
    const created = await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, strengthBonus);
    const edit = (value: string) =>
      ModifiersService.updateModifier(session, rulesetId, "feats", feat.id, created.id, {
        ...strengthBonus,
        value,
        updatedAt: created.updatedAt,
      });
    await edit("3");
    await expectRefusedWith(edit("4"), 409);
  });

  test("duplicates a modifier with a copy of its requirement tree", async () => {
    const { session, rulesetId, feat } = await setup();
    const source = await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, strengthBonus);
    await RequirementsService.createRequirement(session, rulesetId, "modifiers", source.id, {
      level: "1",
      chainingOperator: "and",
    });
    await RequirementsService.createRequirement(session, rulesetId, "modifiers", source.id, {
      level: "1.1",
      target: "combat.bab",
      value: "5",
      operator: "greater_than_or_equal",
    });
    const sourceRequirements = await Requirements.findMany(db, {
      entityIds: [source.id],
      entityType: "modifiers",
    });

    const copy = await ModifiersService.duplicateModifier(session, rulesetId, "feats", feat.id, source.id, {
      ...strengthBonus,
      value: "3",
    });
    expect(copy).toMatchObject({ ...strengthBonus, value: "3", sourceId: feat.id });
    const copied = await Requirements.findMany(db, { entityIds: [copy.id], entityType: "modifiers" });
    expect(
      copied
        .map(({ level, chainingOperator, target }) => ({ level, chainingOperator, target }))
        .sort((a, b) => a.level.localeCompare(b.level)),
    ).toEqual([
      { level: "1", chainingOperator: "and", target: null },
      { level: "1.1", chainingOperator: null, target: "combat.bab" },
    ]);
    expect(copied.map((r) => r.id)).not.toContain(sourceRequirements[0].id);
    expect(await Requirements.findMany(db, { entityIds: [source.id], entityType: "modifiers" })).toEqual(
      sourceRequirements,
    );
  });

  describe("deleting a modifier", () => {
    test("deletes its requirements, keeping its and their activities", async () => {
      const { session, rulesetId, feat } = await setup();
      const [modifier, sibling] = [
        await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, strengthBonus),
        await ModifiersService.createModifier(session, rulesetId, "feats", feat.id, strengthBonus),
      ];
      const group = { level: "1", chainingOperator: "and" } as const;
      const requirements = [
        await RequirementsService.createRequirement(session, rulesetId, "modifiers", modifier.id, group),
        await RequirementsService.createRequirement(session, rulesetId, "modifiers", sibling.id, group),
      ];

      await ModifiersService.deleteModifier(session, rulesetId, "feats", feat.id, modifier.id);

      expect(await Requirements.findMany(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([]);
      expect(await activityTypes(session.userId, modifiersInCustomization, modifier.id)).toEqual([
        "createModifier",
        "deleteModifier",
      ]);
      expect(await activityTypes(session.userId, requirementsInCustomization, requirements[0].id)).toEqual([
        "createRequirement",
      ]);
      // The other modifier keeps its requirement.
      expect(await Requirements.findMany(db, { entityIds: [sibling.id], entityType: "modifiers" })).toMatchObject([
        { id: requirements[1].id },
      ]);
    });
  });
});
