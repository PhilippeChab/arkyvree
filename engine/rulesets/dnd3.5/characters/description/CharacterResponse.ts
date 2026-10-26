import type { SheetStat } from "@/engine/core/module/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import type { Character, Modifier, Requirement } from "@/shared/relations.ts";
import { formatSigned } from "@/shared/text.ts";

import CombatSheet from "./CombatSheet.ts";
import SheetBlocks from "./SheetBlocks.ts";
import SheetSummaries from "./SheetSummaries.ts";
import SkillNames from "./SkillNames.ts";
import SpellGroups from "./SpellGroups.ts";

/**
 * A built character's sheet: every part of it, which its blocks, its summary and its creatures' subsheets are built
 * from (`buildSheet`); and what the API answers of it (`toResponse`): its row's columns, its ruleset, what its
 * modifiers and requirements did and its validation, its summary and its blocks.
 */
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

  /**
   * The character's identity, with the GM's notes in its background, which its identity's block shows to who reads them
   * (a reader who doesn't is described from rows without them: `CharactersPart.describe`).
   */
  private static identityWithPrivateNotes(built: DetailedCharacter) {
    const { identity } = built.components;
    const data = identity.getIdentity();
    const background: typeof data.background & { privateNotes?: string } = {
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

  /** A bonded creature's sheet (`record`, built from its rows: `built`), with its feats: what its subsheet reads. */
  static buildBondedSheet(record: Character, built: DetailedCharacter) {
    return {
      ...CharacterResponse.buildSheet(record, built),
      feats: built.components.feats.getFeats(),
    };
  }

  /**
   * A character's sheet (`record`, built from its rows: `built`): its row's columns, its ruleset, and each part of its
   * sheet, with what its modifiers and requirements did and its validation; and its summary and its blocks, built from
   * them.
   */
  static buildSheet(record: Character, built: DetailedCharacter) {
    const ruleset = built.getRuleset();
    const validation = built.validate();
    const requirements = CharacterResponse.enrichedRequirementsOf(built);
    const modifiers = CharacterResponse.enrichedModifiersOf(built);
    const abilities = CharacterResponse.abilitiesOf(built);
    const combat = CombatSheet.describe(built.components.combat);
    const saves = CharacterResponse.savesOf(built);
    const classes = built.components.classes.getCharacterClasses();
    const equipment = CharacterResponse.equipmentOf(built);
    const identity = CharacterResponse.identityWithPrivateNotes(built);
    const skills = CharacterResponse.skillsOf(built);
    const virtualFeats = built.getVirtualFeats();
    const spellGroups = SpellGroups.describe(built);
    const spellsPerDay = SpellGroups.describePerDay(built);

    return {
      id: record.id,
      userId: record.userId,
      kind: record.kind,
      parentCharacterId: record.parentCharacterId,
      name: record.name,
      rulesetId: record.rulesetId,
      rulesetName: ruleset.name,
      baseRules: ruleset.baseRules,
      isCustomRuleset: !!ruleset.rulesetId,
      deletedAt: record.deletedAt,
      updatedAt: record.updatedAt,
      shareToken: record.shareToken ?? null,
      identity,
      skillBudget: built.components.skills.getSkillBudget(),
      abilities,
      combat,
      saves,
      classes,
      inventory: built.components.inventory.getInventory(),
      equipment,
      skills,
      virtualFeats,
      spellGroups,
      spellsPerDay,
      requirements,
      modifiers,
      validation,
      summary: SheetSummaries.describe(classes),
      blocks: SheetBlocks.describe({
        abilities,
        classes,
        combat,
        equipment,
        identity,
        saves,
        skills,
        spellGroups,
        spellsPerDay,
        virtualFeats,
      }),
    };
  }

  /**
   * The inventory as a flat list of entries, each with its item's own fields, by field (`fields`), and where it's worn
   * (`slotLabel`).
   */
  static equipmentOf(built: DetailedCharacter) {
    return built.components.inventory.getFlatInventory().map((entry) => ({
      id: entry.id,
      itemId: entry.itemId,
      name: entry.item.name,
      description: entry.item.description,
      fields: entry.item.fields,
      quantity: entry.quantity,
      equipped: entry.equipped,
      location: entry.location,
      groups: entry.groups,
      slotLabel: ItemPlacement.describeSlot(entry),
      totalCharges: entry.totalCharges,
      remainingCharges: entry.remainingCharges,
      updatedAt: entry.updatedAt,
    }));
  }

  /**
   * A sheet as the API answers it: its row's columns, its ruleset, what its modifiers and requirements did and its
   * validation, its summary and its blocks; none of its parts as 3.5 holds them, which its blocks show.
   */
  static toResponse(sheet: ReturnType<typeof CharacterResponse.buildSheet>) {
    return {
      id: sheet.id,
      userId: sheet.userId,
      kind: sheet.kind,
      parentCharacterId: sheet.parentCharacterId,
      name: sheet.name,
      rulesetId: sheet.rulesetId,
      rulesetName: sheet.rulesetName,
      baseRules: sheet.baseRules,
      isCustomRuleset: sheet.isCustomRuleset,
      deletedAt: sheet.deletedAt,
      updatedAt: sheet.updatedAt,
      shareToken: sheet.shareToken,
      requirements: sheet.requirements,
      modifiers: sheet.modifiers,
      validation: sheet.validation,
      summary: sheet.summary,
      blocks: sheet.blocks,
    };
  }
}
