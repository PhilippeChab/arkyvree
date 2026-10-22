import type { InferSelectModel } from "drizzle-orm";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import type { NotedSheet, SheetStat } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";
import { formatSigned } from "@/shared/text.ts";

import CombatSheet from "./CombatSheet.ts";
import SkillNames from "./SkillNames.ts";
import SpellGroups from "./SpellGroups.ts";

/** A built character as the API answers it. */
export default class CharacterResponse {
  /** The abilities, each with the parts its box lists beside its base (`parts`: its levels' increases, its misc). */
  private static abilitiesOf(built: DetailedCharacter) {
    return built.components.abilities.getAbilitiesWithIds().map((ability) => ({
      ...ability,
      parts: [
        { label: "Level", value: formatSigned(ability.level) },
        { label: "Misc", value: formatSigned(ability.misc) },
      ] satisfies SheetStat[],
    }));
  }

  /** The modifiers, applied, unapplied and inactive, each with the name of its source. */
  private static enrichedModifiersOf(built: DetailedCharacter) {
    const modifiersData = built.modifierEvaluator.getModifiers();
    const withSource = (mods: Modifier[]) =>
      mods.map((mod) => ({
        ...mod,
        sourceName: built.resolveModifierSourceName(mod)?.name,
      }));
    return {
      ...modifiersData,
      appliedModifiers: withSource(modifiersData.appliedModifiers),
      unappliedModifiers: withSource(modifiersData.unappliedModifiers),
      inactiveModifiers: withSource(modifiersData.inactiveModifiers),
    };
  }

  /** The requirements, each group and each invalid one with the name of the entity it belongs to. */
  private static enrichedRequirementsOf(built: DetailedCharacter) {
    const requirementsData = built.requirementEvaluator.getRequirements();
    const withSource = (group: Requirement[]) => ({
      sourceName: group[0] ? built.resolveEntityName(group[0].entityId, group[0].entityType) : undefined,
      sourceType: group[0]?.entityType,
      requirements: group,
    });
    return {
      ...requirementsData,
      fulfilledRequirementGroups: requirementsData.fulfilledRequirementGroups.map(withSource),
      unmetRequirementGroups: requirementsData.unmetRequirementGroups.map(withSource),
      invalidRequirements: requirementsData.invalidRequirements.map(({ warning, requirement }) => ({
        warning,
        requirement,
        sourceName: built.resolveEntityName(requirement.entityId, requirement.entityType),
      })),
    };
  }

  /** The inventory as a flat list of entries, each with its item's fields and where it's worn (`slotLabel`). */
  private static equipmentOf(built: DetailedCharacter) {
    return built.components.inventory.getFlatInventory().map((entry) => ({
      id: entry.id,
      itemId: entry.itemId,
      name: entry.item.name,
      type: entry.item.type,
      description: entry.item.description,
      weight: entry.item.weight,
      costGp: entry.item.costGp,
      quantity: entry.quantity,
      equipped: entry.equipped,
      location: entry.location,
      weaponSets: entry.weaponSets,
      slotLabel: ItemPlacement.describeSlot(entry),
      totalCharges: entry.totalCharges,
      remainingCharges: entry.remainingCharges,
      updatedAt: entry.updatedAt,
    }));
  }

  /**
   * The character's identity, with the GM's notes in its background, where every ruleset's sheet holds them: which a
   * reader who doesn't read them reads blank or not at all (`CharactersPart.describe`).
   */
  private static identityWithPrivateNotes(built: DetailedCharacter) {
    const { identity } = built.components;
    const data = identity.getIdentity();
    const background: typeof data.background & NotedSheet["identity"]["background"] = {
      ...data.background,
      privateNotes: identity.getPrivateNotes(),
    };
    return { ...data, background };
  }

  /** The saves, each with the parts its box lists (`parts`: its base, its ability's, its misc). */
  private static savesOf(built: DetailedCharacter) {
    return Object.fromEntries(
      Object.entries(built.components.saves.getSaves()).map(([key, save]) => [
        key,
        {
          ...save,
          parts: [
            { label: "Base", value: formatSigned(save.base) },
            { label: "Ability", value: formatSigned(save.ability) },
            { label: "Misc", value: formatSigned(save.misc) },
          ] satisfies SheetStat[],
        },
      ]),
    );
  }

  /** The skills, each with the family a sheet groups it in and its name within it (`SkillNames`). */
  private static skillsOf(built: DetailedCharacter) {
    return Object.fromEntries(
      Object.entries(built.components.skills.getSkills()).map(([slug, skill]) => [
        slug,
        { ...skill, ...SkillNames.describe(skill.name) },
      ]),
    );
  }

  /** A bonded creature (`record`, built from its rows: `built`) as the API answers it: a sheet, with its feats. */
  static buildBonded(record: InferSelectModel<typeof charactersInCharacter>, built: DetailedCharacter) {
    return {
      ...CharacterResponse.buildFull(record, built),
      feats: built.components.feats.getFeats(),
    };
  }

  /**
   * A character (`record`, built from its rows: `built`) as the API answers it: its row's columns, its ruleset, and
   * each part of its sheet, with what its modifiers and requirements did and its validation.
   */
  static buildFull(record: InferSelectModel<typeof charactersInCharacter>, built: DetailedCharacter) {
    const ruleset = built.getRuleset();
    const { issues, valid } = built.validate();
    const requirements = CharacterResponse.enrichedRequirementsOf(built);
    const modifiers = CharacterResponse.enrichedModifiersOf(built);

    return {
      id: record.id,
      userId: record.userId,
      kind: record.kind,
      parentCharacterId: record.parentCharacterId,
      name: record.name,
      raceId: record.raceId,
      rulesetId: record.rulesetId,
      rulesetName: ruleset.name,
      baseRules: ruleset.baseRules,
      isCustomRuleset: !!ruleset.rulesetId,
      deletedAt: record.deletedAt,
      updatedAt: record.updatedAt,
      shareToken: record.shareToken ?? null,
      identity: CharacterResponse.identityWithPrivateNotes(built),
      skillBudget: built.components.skills.getSkillBudget(),
      abilities: CharacterResponse.abilitiesOf(built),
      combat: CombatSheet.describe(built.components.combat),
      saves: CharacterResponse.savesOf(built),
      classes: built.components.classes.getCharacterClasses(),
      inventory: built.components.inventory.getInventory(),
      equipment: CharacterResponse.equipmentOf(built),
      skills: CharacterResponse.skillsOf(built),
      virtualFeats: built.getVirtualFeats(),
      spellGroups: SpellGroups.describe(built),
      spellsPerDay: SpellGroups.describePerDay(built),
      requirements,
      modifiers,
      validation: { issues: issues.map(RulesError.toAnswered), valid },
    };
  }
}
