import type { InferSelectModel } from "drizzle-orm";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import type Dnd35DetailedCharacterBonded from "@/server/rulesets/dnd3.5/bonded/DetailedCharacterBonded.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/engine/types.ts";
import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import { getStaticPropertyValues } from "@/shared/dnd3.5/properties/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** The modifiers, applied, unapplied and inactive, each with the name of its source. */
function enrichedModifiersOf(dc: Dnd35DetailedCharacter) {
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
function enrichedRequirementsOf(dc: Dnd35DetailedCharacter) {
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
function equipmentOf(dc: Dnd35DetailedCharacter) {
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

export function buildBondedMap(
  bondedByKind: Partial<Record<string, { record: InferSelectModel<typeof charactersInCharacter>; detailed: unknown }>>,
  transform?: (entry: ReturnType<typeof buildBondedResponse>) => ReturnType<typeof buildBondedResponse>,
): Record<string, ReturnType<typeof buildBondedResponse>> {
  const out: Record<string, ReturnType<typeof buildBondedResponse>> = {};
  for (const [kind, entry] of Object.entries(bondedByKind)) {
    if (!entry) continue;
    const built = buildBondedResponse(entry.record, entry.detailed as Parameters<typeof buildBondedResponse>[1]);
    out[kind] = transform ? transform(built) : built;
  }
  return out;
}

export function buildBondedResponse(
  record: InferSelectModel<typeof charactersInCharacter>,
  bonded: Dnd35DetailedCharacterBonded,
) {
  return {
    ...buildFullCharacterResponse(record, bonded),
    feats: bonded.components.feats.getFeats(),
  };
}

export function buildFullCharacterResponse(
  character: InferSelectModel<typeof charactersInCharacter>,
  detailedCharacter: DetailedCharacterInterface,
) {
  // Cast once — the response builder is the centralized dnd3.5 presentation layer
  const dc = detailedCharacter as Dnd35DetailedCharacter;
  const ruleset = detailedCharacter.getRuleset();
  const validation = detailedCharacter.validate();
  const requirements = enrichedRequirementsOf(dc);
  const modifiers = enrichedModifiersOf(dc);

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
    identity: detailedCharacter.components.identity.getIdentity(),
    skillBudget: dc.components.skills.getSkillBudget(),
    abilities: detailedCharacter.components.abilities.getAbilitiesWithIds(),
    combat: dc.components.combat.getCombat(),
    savingThrows: dc.components.savingThrows.getSavingThrows(),
    classes: dc.components.classes.getCharacterClasses(),
    inventory: dc.components.inventory.getInventory(),
    equipment: equipmentOf(dc),
    skills: dc.components.skills.getSkills(),
    powers: dc.components.powers.getFlatPowers(),
    ...buildVirtualEntities(dc),
    aptitudes: detailedCharacter.components.aptitudes.getAptitudes(),
    spellTags: dc.getSpellTags(),
    spellTagLists: dc.getSpellTagLists(),
    requirements,
    modifiers,
    validation,
  };
}

/** The feats and powers the character's modifiers make it possess without a pick. */
export function buildVirtualEntities(dc: Dnd35DetailedCharacter) {
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
