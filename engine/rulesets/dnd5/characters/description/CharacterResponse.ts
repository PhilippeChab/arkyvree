import type { SheetStat } from "@/engine/core/module/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5/model/DetailedCharacter.ts";
import ItemPlacement from "@/engine/rulesets/dnd5/rules/ItemPlacement.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";
import { formatSigned } from "@/shared/text.ts";

import CombatSheet from "./CombatSheet.ts";
import SheetBlocks from "./SheetBlocks.ts";
import SheetSummaries from "./SheetSummaries.ts";
import SpellGroups from "./SpellGroups.ts";

/** What a passive check adds its skill's total to: 10. */
const PASSIVE_CHECK_BASE = 10;

/**
 * A built character's sheet: every part of it, which its blocks and its summary are built from (`buildSheet`); and what
 * the API answers of it past its row's columns, which the characters part writes (`toResponse`): what its modifiers
 * and requirements did and its validation, its summary and its blocks.
 */
export default class CharacterResponse {
  /**
   * The abilities, each with the parts its box lists beside its base (`parts`: its increases, a background's, a feat's,
   * an item's).
   */
  private static abilitiesOf(built: DetailedCharacter) {
    return built.components.abilities.getAbilitiesWithIds().map((ability) => ({
      ...ability,
      parts: [{ label: "Increases", value: formatSigned(ability.misc) }] satisfies SheetStat[],
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

  /**
   * The character's passive Perception: 10 and its Perception's total, none in a ruleset without a Perception skill.
   */
  private static passivePerceptionOf(built: DetailedCharacter): number | null {
    const perception = built.components.skills.getPassiveSkill();
    return perception ? PASSIVE_CHECK_BASE + perception.total : null;
  }

  /**
   * The saves, each with the parts its box lists (`parts`: its ability's, its Proficiency Bonus, +0 when not
   * proficient, so every box lists the same lines, and its misc).
   */
  private static savesOf(built: DetailedCharacter) {
    return Object.fromEntries(
      Object.entries(built.components.saves.getSaves()).map(([key, save]) => [
        key,
        {
          ...save,
          parts: [
            { label: "Ability", value: formatSigned(save.ability) },
            { label: "Proficiency", value: formatSigned(save.proficiency) },
            { label: "Misc", value: formatSigned(save.misc) },
          ] satisfies SheetStat[],
        },
      ]),
    );
  }

  /** The skills, each as its row reads it: its ability's modifier, its proficiency and what it adds, its misc. */
  private static skillsOf(built: DetailedCharacter) {
    return Object.fromEntries(
      Object.entries(built.components.skills.getSkills()).map(([slug, skill]) => [
        slug,
        {
          name: skill.name,
          ability: skill.ability,
          abilityName: skill.abilityName,
          proficient: skill.proficient,
          expertise: skill.proficient && skill.expertise,
          halfproficient: !skill.proficient && skill.halfproficient,
          proficiency: skill.proficiency,
          misc: skill.misc,
          total: skill.total,
        },
      ]),
    );
  }

  /**
   * A character's sheet (built from its rows: `built`): each part of it, with what its modifiers and requirements did
   * and its validation; and its summary and its blocks, built from them.
   */
  static buildSheet(built: DetailedCharacter) {
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
    const spellSlots = SpellGroups.describeSlots(built);
    const passivePerception = CharacterResponse.passivePerceptionOf(built);

    return {
      identity,
      abilities,
      combat,
      saves,
      classes,
      inventory: built.components.inventory.getInventory(),
      equipment,
      skills,
      virtualFeats,
      spellGroups,
      spellSlots,
      passivePerception,
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
        passivePerception,
        saves,
        skills,
        spellGroups,
        spellSlots,
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
      location: entry.location,
      groups: entry.groups,
      slotLabel: ItemPlacement.describeSlot(entry),
      totalCharges: entry.totalCharges,
      remainingCharges: entry.remainingCharges,
      updatedAt: entry.updatedAt,
    }));
  }

  /**
   * A sheet as the API answers it past its row's columns, which the characters part writes: what its modifiers and
   * requirements did and its validation, its summary and its blocks; none of its parts as the rules hold them, which
   * its blocks show.
   */
  static toResponse(sheet: ReturnType<typeof CharacterResponse.buildSheet>) {
    return {
      requirements: sheet.requirements,
      modifiers: sheet.modifiers,
      validation: sheet.validation,
      summary: sheet.summary,
      blocks: sheet.blocks,
    };
  }
}
