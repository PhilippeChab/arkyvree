import type { InferSelectModel } from "drizzle-orm";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/model/inventory/ItemPlacement.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** A built character as the API answers it. */
export default class CharacterResponse {
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
      weaponSet: entry.weaponSet,
      slotLabel: ItemPlacement.describeSlot(entry),
      totalCharges: entry.totalCharges,
      remainingCharges: entry.remainingCharges,
      updatedAt: entry.updatedAt,
    }));
  }

  /** The character's identity, with the GM's notes in its background, where the response has always held them. */
  private static identityWithPrivateNotes(built: DetailedCharacter) {
    const { identity } = built.components;
    const data = identity.getIdentity();
    return { ...data, background: { ...data.background, privateNotes: identity.getPrivateNotes() } };
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
    const validation = built.validate();
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
      rulesetName: ruleset?.name ?? null,
      baseRules: ruleset?.baseRules ?? null,
      isCustomRuleset: !!ruleset?.rulesetId,
      deletedAt: record.deletedAt,
      updatedAt: record.updatedAt,
      shareToken: record.shareToken ?? null,
      identity: CharacterResponse.identityWithPrivateNotes(built),
      skillBudget: built.components.skills.getSkillBudget(),
      abilities: built.components.abilities.getAbilitiesWithIds(),
      combat: built.components.combat.getCombat(),
      saves: built.components.saves.getSaves(),
      classes: built.components.classes.getCharacterClasses(),
      inventory: built.components.inventory.getInventory(),
      equipment: CharacterResponse.equipmentOf(built),
      skills: built.components.skills.getSkills(),
      powers: built.components.powers.getFlatPowers(),
      virtualFeats: built.getVirtualFeats(),
      virtualPowers: built.getVirtualPowers(),
      aptitudes: built.components.aptitudes.getAptitudes(),
      spellTags: built.getSpellTags(),
      spellTagLists: built.getSpellTagLists(),
      requirements,
      modifiers,
      validation,
    };
  }
}
