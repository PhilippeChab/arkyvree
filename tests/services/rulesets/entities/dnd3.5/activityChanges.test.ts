import { describe, expect, test } from "bun:test";

import type { RulesetAbility, RulesetSave } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Activities, Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import {
  CLASS_CASTER_TYPE,
  CLASS_HD,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
  FEAT_FAMILY,
  ITEM_COST_GP,
  ITEM_TYPE,
  RACE_QUADRUPED,
  SKILL_USABLE_WITHOUT_TRAINING,
  SPELL_DESCRIPTOR,
  SPELL_SAVE_EFFECT,
  SPELL_SCHOOL,
  WEAPON_BASE_DAMAGE,
  WEAPON_FINESSABLE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** The aptitudes of the test's ruleset. */
const APTITUDES = ["Wizard", "Cleric", "General", "Fighter Bonus Feats"];

/** What the last update of an entity (`targetId`) recorded it changed. */
async function changesOf(userId: string, targetId: string) {
  const { items } = await Activities.findPage(db, { userId }, { limit: 50, page: 1 });
  const update = items.find((activity) => activity.targetId === targetId && activity.type.startsWith("update"));
  return (update?.data as { changedFields?: unknown } | undefined)?.changedFields;
}

/**
 * A new user's ruleset with its aptitudes (`aptitudes`, by name), two abilities and two saves of its own (`abilities`,
 * `saves`, by name).
 */
async function setup() {
  const { session, ruleset, aptitudeIds } = await createTestUserAndRuleset(APTITUDES);
  const aptitudes = Object.fromEntries(APTITUDES.map((name, index) => [name, aptitudeIds[index]]));
  const abilities: Record<string, string> = {};
  for (const name of ["Strength", "Intelligence"]) {
    const [ability] = await Entities.create<RulesetAbility>(db, "abilities", { name, rulesetId: ruleset.id });
    abilities[name] = ability.id;
  }
  const saves: Record<string, string> = {};
  for (const name of ["Fortitude", "Will"]) {
    const [save] = await Entities.create<RulesetSave>(db, "saves", {
      name,
      rulesetId: ruleset.id,
      links: { keyAbility: abilities.Strength },
    });
    saves[name] = save.id;
  }
  return { abilities, aptitudes, rulesetId: ruleset.id, saves, session };
}

describe("An update's activity", () => {
  test("of a spell records its declared fields, its saving throw by name and its lists' entries at their levels", async () => {
    const { aptitudes, rulesetId, saves, session } = await setup();
    const spell = await EntitiesService.createEntity(session, rulesetId, "spells", {
      name: "Shield",
      fields: { [SPELL_SCHOOL]: "Evocation", [SPELL_SAVE_EFFECT]: "negates" },
      links: { listedIn: [{ toId: aptitudes.Wizard, tier: 3 }], resistedBy: saves.Fortitude },
    });
    await EntitiesService.updateEntity(session, rulesetId, "spells", spell.id, {
      name: "Shield",
      fields: { [SPELL_SCHOOL]: "Abjuration", [SPELL_DESCRIPTOR]: ["Force", "Fire"], [SPELL_SAVE_EFFECT]: "negates" },
      links: {
        listedIn: [
          { toId: aptitudes.Wizard, tier: 1 },
          { toId: aptitudes.Cleric, tier: 3 },
        ],
        resistedBy: saves.Will,
      },
    });

    // Its form's order: its columns (its saving throw, its save effect, its lists), then its fields
    expect(await changesOf(session.userId, spell.id)).toEqual([
      { field: "resistedBy", label: "Saving Throw", from: "Fortitude", to: "Will" },
      {
        role: "listedIn",
        label: "Aptitudes",
        added: [
          { toId: aptitudes.Wizard, toName: "Wizard", tier: 1 },
          { toId: aptitudes.Cleric, toName: "Cleric", tier: 3 },
        ],
        removed: [{ toId: aptitudes.Wizard, toName: "Wizard", tier: 3 }],
      },
      { field: SPELL_SCHOOL, label: "School", from: "Evocation", to: "Abjuration" },
      // A list's values, in their declared order
      { field: SPELL_DESCRIPTOR, label: "Descriptors", to: "Fire, Force" },
    ]);
  });

  test("of a feat records its name, its pools added and removed, and its declared fields", async () => {
    const { aptitudes, rulesetId, session } = await setup();
    const feat = await EntitiesService.createEntity(session, rulesetId, "feats", {
      name: "Cleave",
      links: { listedIn: [{ toId: aptitudes.General }] },
    });
    await EntitiesService.updateEntity(session, rulesetId, "feats", feat.id, {
      name: "Great Cleave",
      fields: { [FEAT_FAMILY]: ["Weapon Focus"] },
      links: { listedIn: [{ toId: aptitudes["Fighter Bonus Feats"] }] },
    });

    expect(await changesOf(session.userId, feat.id)).toEqual([
      { field: "name", label: "Name", from: "Cleave", to: "Great Cleave" },
      {
        role: "listedIn",
        label: "Aptitudes",
        added: [{ toId: aptitudes["Fighter Bonus Feats"], toName: "Fighter Bonus Feats" }],
        removed: [{ toId: aptitudes.General, toName: "General" }],
      },
      { field: FEAT_FAMILY, label: "Families", to: "Weapon Focus" },
    ]);
  });

  test("of an item records its columns and its weapon's fields, and nothing it leaves as it was", async () => {
    const { rulesetId, session } = await setup();
    const sword = await EntitiesService.createEntity(session, rulesetId, "items", {
      name: "Sword",
      fields: { [ITEM_TYPE]: "Weapon", [ITEM_COST_GP]: 10, [WEAPON_BASE_DAMAGE]: "1d6" },
    });
    await EntitiesService.updateEntity(session, rulesetId, "items", sword.id, {
      name: "Sword",
      description: "",
      fields: { [ITEM_TYPE]: "Weapon", [ITEM_COST_GP]: 15, [WEAPON_BASE_DAMAGE]: "1d8", [WEAPON_FINESSABLE]: true },
    });

    expect(await changesOf(session.userId, sword.id)).toEqual([
      { field: ITEM_COST_GP, label: "Cost", from: "10", to: "15" },
      { field: WEAPON_BASE_DAMAGE, label: "Damage", from: "1d6", to: "1d8" },
      { field: WEAPON_FINESSABLE, label: "Finessable", to: "true" },
    ]);
  });

  test("of a class records its declared fields and its bonus spell ability by name", async () => {
    const { abilities, rulesetId, session } = await setup();
    const wizard = await EntitiesService.createEntity(session, rulesetId, "classes", {
      name: "Wizard",
      fields: { [CLASS_HD]: 4 },
    });
    await EntitiesService.updateEntity(session, rulesetId, "classes", wizard.id, {
      name: "Wizard",
      fields: { [CLASS_HD]: 6, [CLASS_CASTER_TYPE]: "Arcane" },
      links: { bonusSpellAbility: abilities.Intelligence },
    });

    expect(await changesOf(session.userId, wizard.id)).toEqual([
      { field: CLASS_HD, label: "Hit Die", from: "4", to: "6" },
      { field: "bonusSpellAbility", label: "Bonus Spell Ability", to: "Intelligence" },
      { field: CLASS_CASTER_TYPE, label: "Caster Type", to: "Arcane" },
    ]);
  });

  test("of a class level records its fields, its granted feats through their pools and its saves' base bonuses", async () => {
    const { aptitudes, rulesetId, saves, session } = await setup();
    const fighter = await EntitiesService.createEntity(session, rulesetId, "classes", { name: "Fighter" });
    const cleave = await EntitiesService.createEntity(session, rulesetId, "feats", {
      name: "Cleave",
      links: { listedIn: [{ toId: aptitudes["Fighter Bonus Feats"] }] },
    });
    const level = await EntitiesService.createOwnedEntity(session, rulesetId, "classes", fighter.id, {
      fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 2 },
      links: { baseBonus: [{ toId: saves.Fortitude, amount: 0 }] },
      position: 1,
    });
    await EntitiesService.updateOwnedEntity(session, rulesetId, "classes", fighter.id, level.id, {
      fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 },
      links: {
        baseBonus: [{ toId: saves.Fortitude, amount: 2 }],
        grants: [{ toId: cleave.id, viaId: aptitudes["Fighter Bonus Feats"] }],
      },
    });

    expect(await changesOf(session.userId, level.id)).toEqual([
      {
        role: "baseBonus",
        label: "Saves",
        added: [{ toId: saves.Fortitude, toName: "Fortitude", amount: 2 }],
        removed: [{ toId: saves.Fortitude, toName: "Fortitude", amount: 0 }],
      },
      {
        role: "grants",
        label: "Feats",
        added: [{ toId: cleave.id, toName: "Cleave", viaName: "Fighter Bonus Feats", free: true }],
        removed: [],
      },
      { field: CLASS_LEVEL_SKILL_POINTS, label: "Skill Points", from: "2", to: "4" },
    ]);
  });

  test("of a skill and a race records their flags and a skill's key ability by name", async () => {
    const { abilities, rulesetId, session } = await setup();
    const climb = await EntitiesService.createEntity(session, rulesetId, "skills", {
      name: "Climb",
      links: { keyAbility: abilities.Strength },
    });
    await EntitiesService.updateEntity(session, rulesetId, "skills", climb.id, {
      name: "Climb",
      fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true },
      links: { keyAbility: abilities.Intelligence },
    });
    const horse = await EntitiesService.createEntity(session, rulesetId, "races", { name: "Horse" });
    await EntitiesService.updateEntity(session, rulesetId, "races", horse.id, {
      name: "Horse",
      fields: { [RACE_QUADRUPED]: true },
    });

    expect([await changesOf(session.userId, climb.id), await changesOf(session.userId, horse.id)]).toEqual([
      [
        { field: "keyAbility", label: "Primary Ability", from: "Strength", to: "Intelligence" },
        { field: SKILL_USABLE_WITHOUT_TRAINING, label: "Usable Without Training", from: "false", to: "true" },
      ],
      [{ field: RACE_QUADRUPED, label: "Quadruped", from: "false", to: "true" }],
    ]);
  });
});
