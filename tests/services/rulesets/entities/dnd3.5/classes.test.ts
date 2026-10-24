import { describe, expect, test } from "bun:test";

import type {
  Aptitude,
  Feat,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelPower,
  KlassLevelSave,
  KlassSkill,
  Power,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, Joins, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel } from "@/tests/support/dnd3.5/levels.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID } from "@/vocabulary/dnd3.5/properties/index.ts";

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: classes", () => {
  test("stores a class's hit die, a d8 unless one is given, one of the rules' dice", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const warrior = await EntitiesService.createEntity(session, ruleset.id, "klasses", {
      name: "Warrior",
      description: "A mighty warrior",
      hd: 12,
    });
    expect(warrior).toMatchObject({ name: "Warrior", description: "A mighty warrior", hd: 12 });
    expect(
      (await EntitiesService.updateEntity(session, ruleset.id, "klasses", warrior.id, { name: "Warrior", hd: 10 })).hd,
    ).toBe(10);

    expect((await EntitiesService.createEntity(session, ruleset.id, "klasses", { name: "Mage" })).hd).toBe(8);
    // A hit die the rules have no die for is refused, by its column
    expect(
      EntitiesService.createEntity(session, ruleset.id, "klasses", { name: "Commoner", hd: 0 }),
    ).rejects.toMatchObject({
      issues: [{ category: "hd", message: "Hit Die must be one of: 4, 6, 8, 10, 12" }],
    });
  });

  test("exposes the ability a class's bonus spells come from", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const fighter = await EntitiesService.createEntity(session, ruleset.id, "klasses", { name: "Fighter" });
    expect(await EntitiesService.getEntity(ruleset.id, "klasses", fighter.id)).toMatchObject({
      bonusSpellAbilityId: null,
    });

    const wizard = await EntitiesService.createEntity(session, ruleset.id, "klasses", { name: "Wizard", hd: 4 });
    const [intelligence] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Intelligence",
      description: "Intelligence",
      rulesetId: ruleset.id,
    });
    await EntitiesService.updateEntity(session, ruleset.id, "klasses", wizard.id, {
      name: "Wizard",
      fields: { bonusSpellAbilityId: intelligence.id },
    });
    expect(await EntitiesService.getEntity(ruleset.id, "klasses", wizard.id)).toMatchObject({
      bonusSpellAbilityId: intelligence.id,
    });
    expect(await Properties.findMany(db, { entityIds: [wizard.id], entityType: "klasses" })).toMatchObject([
      { type: KLASS_BONUS_SPELL_ABILITY_ID, value: intelligence.id },
    ]);
  });

  test("deletes a class's levels with their feats, powers, saves and modifiers, and its class skills", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const rulesetId = ruleset.id;
    const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Strength",
      description: "Strength",
      rulesetId,
    });
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", { name: "Class Aptitude", rulesetId });
    const [feat] = await Entities.create<Feat>(db, "feats", { name: "Class Feat", rulesetId });
    const [power] = await Entities.create<Power>(db, "powers", { name: "Class Power", rulesetId });
    const [save] = await Entities.create<RulesetSave>(db, "saves", {
      name: "Class Save",
      abilityId: ability.id,
      rulesetId,
    });
    const [skill] = await Entities.create<Skill>(db, "skills", {
      name: "Class Skill",
      primaryAbilityId: ability.id,
      rulesetId,
    });

    const klass = await EntitiesService.createEntity(session, rulesetId, "klasses", { name: "Doomed Class" });
    await Joins.create<KlassSkill>(db, "klass_skills", { klassId: klass.id, skillId: skill.id });
    const level = await EntitiesService.createOwnedEntity(session, rulesetId, "klasses", klass.id, {
      level: 1,
      fields: { bab: 1, skills: 4 },
      feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
      saves: [{ saveId: save.id, base: 2 }],
    });
    await Joins.create<KlassLevelPower>(db, "klass_level_powers", {
      klassLevelId: level.id,
      powerId: power.id,
      aptitudeId: aptitude.id,
    });
    await Modifiers.create(db, {
      sourceId: level.id,
      sourceType: "klass_levels",
      target: "abilities.strength",
      value: "1",
      valueType: "number",
      operator: "add",
    });

    await EntitiesService.deleteEntity(session, rulesetId, "klasses", klass.id);

    expect(await Entities.findOne<KlassLevel>(db, { entityType: "klass_levels", id: level.id })).toBeUndefined();
    expect(await Joins.findMany<KlassLevelFeat>(db, { join: "klass_level_feats", fromIds: [level.id] })).toEqual([]);
    expect(await Joins.findMany<KlassLevelPower>(db, { join: "klass_level_powers", fromIds: [level.id] })).toEqual([]);
    expect(await Joins.findMany<KlassLevelSave>(db, { join: "klass_level_saves", fromIds: [level.id] })).toEqual([]);
    expect(await Joins.findMany<KlassSkill>(db, { join: "klass_skills", fromIds: [klass.id] })).toEqual([]);
    expect(await Modifiers.findMany(db, { sourceIds: [level.id], sourceType: "klass_levels" })).toEqual([]);
  });

  test("copies an inherited class into a fork with its levels, their modifiers and those modifiers' requirements", async () => {
    const { user, session, ruleset: parent } = await createTestUserAndRuleset();
    const klass = await EntitiesService.createEntity(session, parent.id, "klasses", { name: "Cleric" });
    const level = await EntitiesService.createOwnedEntity(session, parent.id, "klasses", klass.id, {
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

    const copy = await EntitiesService.updateEntity(session, fork.id, "klasses", klass.id, {
      name: "Cleric",
      description: "Forked",
    });

    const [copiedLevel] = await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [copy.id] });
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
    const klass = await EntitiesService.createEntity(session, ruleset.id, "klasses", { name: "Taken Class" });
    const level = await EntitiesService.createOwnedEntity(session, ruleset.id, "klasses", klass.id, {
      level: 1,
      fields: { bab: 1, skills: 2 },
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    await addCharacterLevel(character.id, level.id);

    expect(EntitiesService.deleteEntity(session, ruleset.id, "klasses", klass.id)).rejects.toThrow(ConflictError);
  });
});
