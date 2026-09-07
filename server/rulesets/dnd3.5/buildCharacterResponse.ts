import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import type Dnd35DetailedCharacterBonded from "@/server/rulesets/dnd3.5/DetailedCharacterBonded.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/types.ts";
import type { Modifier } from "@/shared/relations.ts";
import type { InferSelectModel } from "drizzle-orm";
import type { charactersInCharacter } from "@/drizzle/schema.ts";

export function buildFullCharacterResponse(
  character: InferSelectModel<typeof charactersInCharacter>,
  detailedCharacter: DetailedCharacterInterface,
) {
  // Cast once — the response builder is the centralized dnd3.5 presentation layer
  const dc = detailedCharacter as Dnd35DetailedCharacter;

  const ruleset = detailedCharacter.getRuleset();
  const identity = detailedCharacter.getDetailedCharacterIdentity();
  const abilities = detailedCharacter.getDetailedCharacterAbilities();
  const combat = dc.getDetailedCharacterCombat();
  const savingThrows = dc.getDetailedCharacterSavingThrows();
  const classes = dc.getDetailedCharacterClasses();
  const inventory = dc.getDetailedCharacterInventory();
  const skills = dc.getDetailedCharacterSkills();
  const powers = dc.getDetailedCharacterPowers();
  const aptitudes = detailedCharacter.getDetailedCharacterAptitudes();
  const requirements = dc.getDetailedCharacterRequirements();
  const modifiers = dc.getDetailedCharacterModifiers();
  const validation = detailedCharacter.validate();

  const requirementsData = requirements.getRequirements();
  const modifiersData = modifiers.getModifiers();

  const resolveGroupSource = (group: { entityId: string; entityType: string }[]) => {
    const first = group[0];
    if (!first) return undefined;
    return dc.resolveEntityName(first.entityId, first.entityType);
  };

  const enrichedRequirements = {
    ...requirementsData,
    fulfilledRequirementGroups: requirementsData.fulfilledRequirementGroups.map((group) => ({
      sourceName: resolveGroupSource(group),
      sourceType: group[0]?.entityType,
      requirements: group,
    })),
    unmetRequirementGroups: requirementsData.unmetRequirementGroups.map((group) => ({
      sourceName: resolveGroupSource(group),
      sourceType: group[0]?.entityType,
      requirements: group,
    })),
    invalidRequirements: requirementsData.invalidRequirements.map(({ warning, requirement }) => ({
      warning,
      requirement,
      sourceName: dc.resolveEntityName(requirement.entityId, requirement.entityType),
    })),
  };

  const enrichModifiers = (mods: Modifier[]) =>
    mods.map((mod) => ({
      ...mod,
      sourceName: dc.resolveModifierSourceName(mod)?.name,
    }));

  const enrichedModifiers = {
    ...modifiersData,
    appliedModifiers: enrichModifiers(modifiersData.appliedModifiers),
    unappliedModifiers: enrichModifiers(modifiersData.unappliedModifiers),
    inactiveModifiers: enrichModifiers(modifiersData.inactiveModifiers),
  };

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
    identity: identity.getIdentity(),
    skillBudget: dc.getDetailedCharacterSkills().getSkillBudget(),
    abilities: abilities.getAbilitiesWithIds(),
    combat: combat.getCombat(),
    savingThrows: savingThrows.getSavingThrows(),
    classes: classes.getCharacterClasses(),
    inventory: inventory.getInventory(),
    equipment: inventory.getFlatInventory().map((entry) => ({
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
    })),
    skills: skills.getSkills(),
    powers: powers.getFlatPowers(),
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
      properties: Object.fromEntries(
        entry.properties.map((p) => [p.type, p.value]),
      ),
    })),
    aptitudes: aptitudes.getAptitudes(),
    spellTags: dc.getSpellTags(),
    requirements: enrichedRequirements,
    modifiers: enrichedModifiers,
    validation,
  };
}

export function buildBondedMap(
  bondedByKind: Partial<Record<string, { record: InferSelectModel<typeof charactersInCharacter>; detailed: unknown }>>,
  transform?: (entry: ReturnType<typeof buildBondedResponse>) => ReturnType<typeof buildBondedResponse>,
): Record<string, ReturnType<typeof buildBondedResponse>> {
  const out: Record<string, ReturnType<typeof buildBondedResponse>> = {};
  for (const [kind, entry] of Object.entries(bondedByKind)) {
    if (!entry) continue;
    const built = buildBondedResponse(
      entry.record,
      entry.detailed as Parameters<typeof buildBondedResponse>[1],
    );
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
    feats: bonded.getDetailedCharacterFeats().getFeats(),
  };
}
