import { describe, expect, test } from "bun:test";

import type {
  Aptitude,
  Feat,
  KlassLevel,
  RulesetAbility,
  RulesetSave,
  Skill,
  Spell,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, EntityLinks, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel } from "@/tests/support/dnd3.5/levels.ts";
import { addClassSkills, addGrants } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { findFormValues } from "@/tests/support/ownerValues.ts";
import { createTestRuleset, type Described } from "@/tests/support/rulesets.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: classes", () => {
  test("stores a class's hit die, a d8 unless one is given, one of the rules' dice", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const warrior = await EntitiesService.createEntity(session, ruleset.id, "classes", {
      name: "Warrior",
      description: "A mighty warrior",
      hd: 12,
    });
    expect(warrior).toMatchObject({ name: "Warrior", description: "A mighty warrior", fields: { [CLASS_HD]: 12 } });
    expect(
      (await EntitiesService.updateEntity(session, ruleset.id, "classes", warrior.id, { name: "Warrior", hd: 10 }))
        .fields[CLASS_HD],
    ).toBe(10);

    expect(
      (await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Mage" })).fields[CLASS_HD],
    ).toBe(8);
    // A hit die the rules have no die for is refused, by its column
    expect(
      EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Commoner", hd: 0 }),
    ).rejects.toMatchObject({
      issues: [{ category: "hd", message: "Hit Die must be one of: 4, 6, 8, 10, 12" }],
    });
  });

  test("exposes the ability a class's bonus spells come from", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const fighter = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Fighter" });
    const bonusSpellAbilityOf = async (id: string) =>
      (await EntitiesService.getEntity<Described<"classes">>(ruleset.id, "classes", id)).links
        .filter((link) => link.role === "bonusSpellAbility")
        .map((link) => link.toId);
    expect(await bonusSpellAbilityOf(fighter.id)).toEqual([]);

    const wizard = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Wizard", hd: 4 });
    const [intelligence] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Intelligence",
      description: "Intelligence",
      rulesetId: ruleset.id,
    });
    // Written past the services, after the wizard's create read the ruleset's view
    RulesetViews.invalidate(ruleset.id);
    await EntitiesService.updateEntity(session, ruleset.id, "classes", wizard.id, {
      name: "Wizard",
      fields: { bonusSpellAbilityId: intelligence.id },
    });
    expect(await bonusSpellAbilityOf(wizard.id)).toEqual([intelligence.id]);
    expect(await findFormValues("classes", wizard.id)).toEqual({
      fields: {},
      links: { bonusSpellAbility: intelligence.id },
    });
  });

  test("deletes a class's levels with their feats, spells, saves and modifiers, and its class skills", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const rulesetId = ruleset.id;
    const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Strength",
      description: "Strength",
      rulesetId,
    });
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", { name: "Class Aptitude", rulesetId });
    const [feat] = await Entities.create<Feat>(db, "feats", { name: "Class Feat", rulesetId });
    const [spell] = await Entities.create<Spell>(db, "spells", { name: "Class Spell", rulesetId });
    const [save] = await Entities.create<RulesetSave>(db, "saves", {
      name: "Class Save",
      rulesetId,
      links: { keyAbility: ability.id },
    });
    const [skill] = await Entities.create<Skill>(db, "skills", {
      name: "Class Skill",
      rulesetId,
      links: { keyAbility: ability.id },
    });

    const klass = await EntitiesService.createEntity(session, rulesetId, "classes", { name: "Doomed Class" });
    await addClassSkills(db, klass.id, [skill.id]);
    const level = await EntitiesService.createOwnedEntity(session, rulesetId, "classes", klass.id, {
      level: 1,
      fields: { bab: 1, skills: 4 },
      feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
      saves: [{ saveId: save.id, base: 2 }],
    });
    await addGrants(db, level.id, "spells", [{ toId: spell.id, aptitudeId: aptitude.id }]);
    await Modifiers.create(db, {
      sourceId: level.id,
      sourceType: "class_levels",
      target: "abilities.strength",
      value: "1",
      valueType: "number",
      operator: "add",
    });

    await EntitiesService.deleteEntity(session, rulesetId, "classes", klass.id);

    expect(await Entities.findOne<KlassLevel>(db, { entityType: "class_levels", id: level.id })).toBeUndefined();
    expect(await EntityLinks.findMany(db, { fromIds: [level.id, klass.id] })).toEqual([]);
    expect(await Modifiers.findMany(db, { sourceIds: [level.id], sourceType: "class_levels" })).toEqual([]);
  });

  test("copies an inherited class into a fork with its levels, their modifiers and those modifiers' requirements", async () => {
    const { user, session, ruleset: parent } = await createTestUserAndRuleset();
    const klass = await EntitiesService.createEntity(session, parent.id, "classes", { name: "Cleric" });
    const level = await EntitiesService.createOwnedEntity(session, parent.id, "classes", klass.id, {
      level: 1,
      fields: { bab: 0, skills: 2 },
    });
    const [modifier] = await Modifiers.create(db, {
      sourceId: level.id,
      sourceType: "class_levels",
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

    const copy = await EntitiesService.updateEntity(session, fork.id, "classes", klass.id, {
      name: "Cleric",
      description: "Forked",
    });

    const [copiedLevel] = await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [copy.id] });
    expect(copiedLevel).toMatchObject({ position: 1 });
    const [copiedModifier] = await Modifiers.findMany(db, {
      sourceIds: [copiedLevel.id],
      sourceType: "class_levels",
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
    const klass = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Taken Class" });
    const level = await EntitiesService.createOwnedEntity(session, ruleset.id, "classes", klass.id, {
      level: 1,
      fields: { bab: 1, skills: 2 },
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    await addCharacterLevel(character.id, level.id);

    expect(EntitiesService.deleteEntity(session, ruleset.id, "classes", klass.id)).rejects.toThrow(ConflictError);
  });
});
