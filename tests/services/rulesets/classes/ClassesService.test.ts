import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  abilitiesInRules,
  klassLevelFeatsInRules,
  klassLevelPowersInRules,
  klassLevelSavesInRules,
  klassSkillsInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  Aptitudes,
  Feats,
  KlassLevels,
  KlassSkills,
  Modifiers,
  Powers,
  Properties,
  Requirements,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { insertRows } from "@/tests/support/database.ts";
import { addCharacterLevel } from "@/tests/support/levels.ts";
import { createTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID } from "@/vocabulary/dnd3.5/properties/index.ts";

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("ClassesService", () => {
  test("stores a class's hit die, a d8 unless one is given", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const warrior = await ClassesService.createClass(session, ruleset.id, {
      name: "Warrior",
      description: "A mighty warrior",
      hd: 12,
    });
    expect(warrior).toMatchObject({ name: "Warrior", description: "A mighty warrior", hd: 12 });
    expect((await ClassesService.updateClass(session, ruleset.id, warrior.id, { name: "Warrior", hd: 10 })).hd).toBe(
      10,
    );

    expect((await ClassesService.createClass(session, ruleset.id, { name: "Mage" })).hd).toBe(8);
    // 0 is no hit die: the default applies.
    expect((await ClassesService.createClass(session, ruleset.id, { name: "Commoner", hd: 0 })).hd).toBe(8);
  });

  test("exposes the ability a class's bonus spells come from", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const fighter = await ClassesService.createClass(session, ruleset.id, { name: "Fighter" });
    expect(await ClassesService.getClass(ruleset.id, fighter.id)).toMatchObject({
      bonusSpellAbilityId: null,
      propertyIds: { bonusSpellAbilityId: null },
    });

    const wizard = await ClassesService.createClass(session, ruleset.id, { name: "Wizard", hd: 4 });
    const [intelligence] = await insertRows(abilitiesInRules, [
      { name: "Intelligence", description: "Intelligence", rulesetId: ruleset.id },
    ]);
    const [property] = await Properties.create(db, {
      entityId: wizard.id,
      entityType: "klasses",
      type: KLASS_BONUS_SPELL_ABILITY_ID,
      value: intelligence.id,
    });
    expect(await ClassesService.getClass(ruleset.id, wizard.id)).toMatchObject({
      bonusSpellAbilityId: intelligence.id,
      propertyIds: { bonusSpellAbilityId: property.id },
    });
  });

  test("deletes a class's levels with their feats, powers, saves and modifiers, and its class skills", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const rulesetId = ruleset.id;
    const [ability] = await insertRows(abilitiesInRules, [{ name: "Strength", description: "Strength", rulesetId }]);
    const [aptitude] = await Aptitudes.create(db, { name: "Class Aptitude", rulesetId });
    const [feat] = await Feats.create(db, { name: "Class Feat", rulesetId });
    const [power] = await Powers.create(db, { name: "Class Power", rulesetId });
    const [save] = await Saves.create(db, { name: "Class Save", abilityId: ability.id, rulesetId });
    const [skill] = await Skills.create(db, { name: "Class Skill", primaryAbilityId: ability.id, rulesetId });

    const klass = await ClassesService.createClass(session, rulesetId, { name: "Doomed Class" });
    await KlassSkills.create(db, { klassId: klass.id, skillId: skill.id });
    const level = await ClassLevelsService.createClassLevel(session, rulesetId, klass.id, {
      level: 1,
      fields: { bab: 1, skills: 4 },
      feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
      saves: [{ saveId: save.id, base: 2 }],
    });
    await insertRows(klassLevelPowersInRules, [{ klassLevelId: level.id, powerId: power.id, aptitudeId: aptitude.id }]);
    await Modifiers.create(db, {
      sourceId: level.id,
      sourceType: "klass_levels",
      target: "abilities.strength",
      value: "1",
      valueType: "number",
      operator: "add",
    });

    await ClassesService.deleteClass(session, rulesetId, klass.id);

    expect(await KlassLevels.findOne(db, { id: level.id })).toBeUndefined();
    expect(
      await db.select().from(klassLevelFeatsInRules).where(eq(klassLevelFeatsInRules.klassLevelId, level.id)),
    ).toEqual([]);
    expect(
      await db.select().from(klassLevelPowersInRules).where(eq(klassLevelPowersInRules.klassLevelId, level.id)),
    ).toEqual([]);
    expect(
      await db.select().from(klassLevelSavesInRules).where(eq(klassLevelSavesInRules.klassLevelId, level.id)),
    ).toEqual([]);
    expect(await db.select().from(klassSkillsInRules).where(eq(klassSkillsInRules.klassId, klass.id))).toEqual([]);
    expect(await Modifiers.findMany(db, { sourceIds: [level.id], sourceType: "klass_levels" })).toEqual([]);
  });

  test("copies an inherited class into a fork with its levels, their modifiers and those modifiers' requirements", async () => {
    const { user, session, ruleset: parent } = await createTestUserAndRuleset();
    const klass = await ClassesService.createClass(session, parent.id, { name: "Cleric" });
    const level = await ClassLevelsService.createClassLevel(session, parent.id, klass.id, {
      level: 1,
      fields: { bab: 0, skills: 2 },
    });
    const [modifier] = await Modifiers.create(db, {
      sourceId: level.id,
      sourceType: "klass_levels",
      target: "saves.fortitude.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    });
    const [requirement] = await Requirements.create(db, {
      entityId: modifier.id,
      entityType: "modifiers",
      level: "1",
      chainingOperator: "and",
    });
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    const copy = await ClassesService.updateClass(session, fork.id, klass.id, {
      name: "Cleric",
      description: "Forked",
    });

    const [copiedLevel] = await KlassLevels.findMany(db, { klassId: copy.id });
    expect(copiedLevel).toMatchObject({ level: 1 });
    const [copiedModifier] = await Modifiers.findMany(db, {
      sourceIds: [copiedLevel.id],
      sourceType: "klass_levels",
    });
    expect(copiedModifier).toMatchObject({ target: "saves.fortitude.misc", value: "1" });
    const copiedRequirements = await Requirements.findMany(db, {
      entityIds: [copiedModifier.id],
      entityType: "modifiers",
    });
    expect(copiedRequirements).toMatchObject([{ chainingOperator: "and" }]);
    expect(copiedRequirements[0].id).not.toBe(requirement.id);
  });

  test("refuses to delete a class a character has a level in", async () => {
    const { user, session, ruleset } = await createTestUserAndRuleset();
    const klass = await ClassesService.createClass(session, ruleset.id, { name: "Taken Class" });
    const level = await ClassLevelsService.createClassLevel(session, ruleset.id, klass.id, {
      level: 1,
      fields: { bab: 1, skills: 2 },
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    await addCharacterLevel(character.id, level.id);

    await expect(ClassesService.deleteClass(session, ruleset.id, klass.id)).rejects.toThrow(ConflictError);
  });
});
