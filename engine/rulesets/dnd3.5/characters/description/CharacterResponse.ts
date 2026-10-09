import type { InferSelectModel } from "drizzle-orm";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import { getStaticPropertyValues } from "@/shared/dnd3.5/properties/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** The modifiers, applied, unapplied and inactive, each with the name of its source. */
function enrichedModifiersOf(dc: DetailedCharacter) {
  const modifiersData = dc.modifierEvaluator.getModifiers();
  const withSource = (mods: Modifier[]) =>
    mods.map((mod) => ({
      ...mod,
      sourceName: dc.resolveModifierSourceName(mod)?.name,
    }));
  return {
    ...modifiersData,
    appliedModifiers: withSource(modifiersData.appliedModifiers),
    unappliedModifiers: withSource(modifiersData.unappliedModifiers),
    inactiveModifiers: withSource(modifiersData.inactiveModifiers),
  };
}

/** The requirements, each group and each invalid one with the name of the entity it belongs to. */
function enrichedRequirementsOf(dc: DetailedCharacter) {
  const requirementsData = dc.requirementEvaluator.getRequirements();
  const withSource = (group: Requirement[]) => ({
    sourceName: group[0] ? dc.resolveEntityName(group[0].entityId, group[0].entityType) : undefined,
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
      sourceName: dc.resolveEntityName(requirement.entityId, requirement.entityType),
    })),
  };
}

/** The inventory as a flat list of entries, each with its item's fields. */
function equipmentOf(dc: DetailedCharacter) {
  return dc.components.inventory.getFlatInventory().map((entry) => ({
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
    totalCharges: entry.totalCharges,
    remainingCharges: entry.remainingCharges,
    updatedAt: entry.updatedAt,
  }));
}

/** The character's identity, with the GM's notes in its background, where the response has always held them. */
function identityWithPrivateNotes(detailedCharacter: DetailedCharacter) {
  const { identity } = detailedCharacter.components;
  const data = identity.getIdentity();
  return { ...data, background: { ...data.background, privateNotes: identity.getPrivateNotes() } };
}

/** A built character as the API answers it. */
export default class CharacterResponse {
  static buildBonded(record: InferSelectModel<typeof charactersInCharacter>, bonded: DetailedCharacter) {
    return {
      ...CharacterResponse.buildFull(record, bonded),
      feats: bonded.components.feats.getFeats(),
    };
  }

  static buildFull(character: InferSelectModel<typeof charactersInCharacter>, detailedCharacter: DetailedCharacter) {
    const ruleset = detailedCharacter.getRuleset();
    const validation = detailedCharacter.validate();
    const requirements = enrichedRequirementsOf(detailedCharacter);
    const modifiers = enrichedModifiersOf(detailedCharacter);

    return {
      id: character.id,
      userId: character.userId,
      kind: character.kind,
      parentCharacterId: character.parentCharacterId,
      name: character.name,
      raceId: character.raceId,
      rulesetId: character.rulesetId,
      rulesetName: ruleset?.name ?? null,
      baseRules: ruleset?.baseRules ?? null,
      isCustomRuleset: !!ruleset?.rulesetId,
      deletedAt: character.deletedAt,
      updatedAt: character.updatedAt,
      shareToken: character.shareToken ?? null,
      identity: identityWithPrivateNotes(detailedCharacter),
      skillBudget: detailedCharacter.components.skills.getSkillBudget(),
      abilities: detailedCharacter.components.abilities.getAbilitiesWithIds(),
      combat: detailedCharacter.components.combat.getCombat(),
      saves: detailedCharacter.components.saves.getSaves(),
      classes: detailedCharacter.components.classes.getCharacterClasses(),
      inventory: detailedCharacter.components.inventory.getInventory(),
      equipment: equipmentOf(detailedCharacter),
      skills: detailedCharacter.components.skills.getSkills(),
      powers: detailedCharacter.components.powers.getFlatPowers(),
      ...CharacterResponse.buildVirtualEntities(detailedCharacter),
      aptitudes: detailedCharacter.components.aptitudes.getAptitudes(),
      spellTags: detailedCharacter.getSpellTags(),
      spellTagLists: detailedCharacter.getSpellTagLists(),
      requirements,
      modifiers,
      validation,
    };
  }

  /** The feats and powers the character's modifiers make it possess without a pick. */
  static buildVirtualEntities(dc: DetailedCharacter) {
    return {
      virtualFeats: dc.getVirtuallyPossessedFeats().map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        stackable: f.stackable,
      })),
      virtualPowers: dc.getVirtuallyPossessedPowersWithAptitudes().map((entry) => ({
        id: entry.power.id,
        name: entry.power.name,
        description: entry.power.description,
        saveName: entry.saveName,
        saveEffect: entry.power.saveEffect,
        aptitudeId: entry.aptitudeId,
        level: entry.level,
        dc: entry.dc,
        properties: formatPropertyValues(
          groupPropertyValues(entry.properties, getStaticPropertyValues),
          getStaticPropertyValues,
        ),
      })),
    };
  }
}
