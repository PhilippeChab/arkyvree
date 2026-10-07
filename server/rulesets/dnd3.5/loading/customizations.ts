/** What each loaded entity carries: its properties, modifiers and requirements, and the character's modifiers in order. */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type {
  CustomizedFeat,
  CustomizedKlassLevel,
  CustomizedPower,
  CustomizedRace,
  InventoryEntry,
} from "@/server/rulesets/engine/types.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/shared/dnd3.5/properties/index.ts";
import type { KlassLevel, Modifier, Race, Requirement } from "@/shared/relations.ts";

import type { SharedCharacterData } from "./DetailedCharacterDataLoader.ts";
import type { buildFeats, buildPowers } from "./picks.ts";

/**
 * The character's modifiers and requirement groups, in order: its own modifiers, its race's, its equipped items',
 * its class levels', its classes' (once per class), its feats' and its powers'. An auto-granted feat or power
 * bypasses its own prereqs — the granting source is the gate. Then each modifier's requirements — spans ruleset
 * (entityType='modifiers' rows indexed by modifier.id, including kept sibling-modifier rows merged by compose) +
 * char/virtual modifier requirements (`extraRequirements`, which the cache misses).
 */
export function collectModifiers(
  parts: {
    characterSourcedModifiers: Modifier[];
    race: CustomizedRace;
    inventory: InventoryEntry[];
    klassLevels: CustomizedKlassLevel[];
    klassEntityIds: string[];
    feats: CustomizedFeat[];
    powers: CustomizedPower[];
  },
  rulesetData: RulesetData,
  extraRequirements: Requirement[],
) {
  const modifiers: Modifier[] = [...parts.characterSourcedModifiers, ...parts.race.modifiers];
  const requirementGroups: Requirement[][] = [parts.race.requirements];
  // An equipped item's modifiers once, however many places it's in (a dagger in each hand): one that targets the
  // weapon holding it reaches each of them already
  const equippedItemIds = new Set<string>();
  for (const inv of parts.inventory) {
    if (!inv.equipped || equippedItemIds.has(inv.item.id)) continue;
    equippedItemIds.add(inv.item.id);
    modifiers.push(...inv.item.modifiers);
    requirementGroups.push(inv.item.requirements);
  }
  for (const klassLevel of parts.klassLevels) {
    modifiers.push(...klassLevel.modifiers);
    requirementGroups.push(klassLevel.requirements);
  }
  // A class's own modifiers and requirements, once for a character with any level of it
  for (const klassId of parts.klassEntityIds) {
    modifiers.push(...(rulesetData.modifiersBySource.get(klassId) ?? []));
    requirementGroups.push(rulesetData.requirementsByEntity.get(klassId) ?? []);
  }
  for (const feat of parts.feats) {
    modifiers.push(...feat.modifiers);
    if (feat.klassLevelFeatId || feat.virtual) continue;
    requirementGroups.push(feat.requirements);
  }
  for (const power of parts.powers) {
    modifiers.push(...power.modifiers);
    if (power.free || power.virtual) continue;
    requirementGroups.push(power.requirements);
  }

  const extraReqsByEntityId = Map.groupBy(extraRequirements, (r) => r.entityId);
  for (const modifier of modifiers) {
    const fromRuleset = rulesetData.requirementsByEntity.get(modifier.id) ?? [];
    const fromExtra = extraReqsByEntityId.get(modifier.id) ?? [];
    if (fromExtra.length === 0) requirementGroups.push(fromRuleset);
    else requirementGroups.push([...fromRuleset, ...fromExtra]);
  }
  return { modifiers, requirementGroups };
}

/**
 * Feat properties/modifiers/requirements. Compose step pre-merges siblings into these buckets; consumers only read.
 * Virtually possessed feats are appended with `virtual: true` so the rest of the pipeline sees one unified list —
 * eliminates the parallel "real vs virtual" code paths (registerFeat, possessed counts, modifier loading) that
 * historically missed cases like grouping DC bonuses on virtually-granted spells.
 */
export function toCustomizedFeats(
  allFeats: ReturnType<typeof buildFeats>["allFeats"],
  virtuallyPossessedFeatIds: string[],
  rulesetData: RulesetData,
): CustomizedFeat[] {
  const realFeats: CustomizedFeat[] = allFeats.map((feat) => ({
    ...feat,
    properties: rulesetData.propertiesByEntity.get(feat.id) ?? [],
    modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
    requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
  }));
  const virtualFeats: CustomizedFeat[] = [];
  for (const featId of virtuallyPossessedFeatIds) {
    const featRow = rulesetData.featsById.get(featId);
    if (!featRow) continue;
    virtualFeats.push({
      ...featRow,
      klassLevelId: "",
      characterLevelId: "",
      aptitudeId: "",
      virtual: true,
      properties: rulesetData.propertiesByEntity.get(featId) ?? [],
      modifiers: rulesetData.modifiersBySource.get(featId) ?? [],
      requirements: rulesetData.requirementsByEntity.get(featId) ?? [],
    });
  }
  return [...realFeats, ...virtualFeats];
}

/**
 * Item properties/modifiers/requirements (with template inheritance via sourceItemId). The base item's requirements
 * are the proficiency with it: its template's, or its own when it is one. Its own on top of a template, or a plain
 * item's, are its other requirements, which its modifiers need
 */
export function toCustomizedInventory(
  inventory: SharedCharacterData["inventory"],
  rulesetData: RulesetData,
): InventoryEntry[] {
  return inventory.map((inv) => {
    const item = inv.itemsInRule;
    const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
    const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
    const templateProperties = item.sourceItemId
      ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []).filter((p) => !ownPropertyTypes.has(p.type))
      : [];
    const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
    const templateRequirements = item.sourceItemId
      ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
      : [];
    return {
      ...inv,
      item: {
        ...item,
        properties: [...templateProperties, ...ownProperties],
        modifiers: inv.equipped ? (rulesetData.modifiersBySource.get(item.id) ?? []) : [],
        proficiency: item.isTemplate ? ownRequirements : templateRequirements,
        requirements: item.isTemplate ? [] : ownRequirements,
      },
    };
  });
}

/** Klass level properties/modifiers/requirements, and each level's bab and skill points. */
export function toCustomizedKlassLevels(klassLevelsRaw: KlassLevel[], rulesetData: RulesetData) {
  const klassLevels: CustomizedKlassLevel[] = klassLevelsRaw
    .map((level) => ({
      ...level,
      properties: rulesetData.propertiesByEntity.get(level.id) ?? [],
      modifiers: rulesetData.modifiersBySource.get(level.id) ?? [],
      requirements: rulesetData.requirementsByEntity.get(level.id) ?? [],
    }))
    .sort((a, b) => a.level - b.level);

  const klassLevelProperties = new Map<string, { bab: number; skills: number }>();
  for (const klassLevel of klassLevels) {
    let entry = klassLevelProperties.get(klassLevel.id);
    if (!entry) {
      entry = { bab: 0, skills: 0 };
      klassLevelProperties.set(klassLevel.id, entry);
    }
    for (const prop of klassLevel.properties) {
      if (prop.type === KLASS_LEVEL_BAB) entry.bab = Number(prop.value);

      if (prop.type === KLASS_LEVEL_SKILL_POINTS) entry.skills = Number(prop.value);
    }
  }
  return { klassLevels, klassLevelProperties };
}

/** Power properties/modifiers/requirements. Compose step pre-merges siblings. */
export function toCustomizedPowers(
  allPowers: ReturnType<typeof buildPowers>["allPowers"],
  virtuallyPossessedPowers: { powerId: string; aptitudeId: string }[],
  rulesetData: RulesetData,
): CustomizedPower[] {
  const realPowers: CustomizedPower[] = allPowers.map((power) => ({
    ...power,
    properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
    modifiers: rulesetData.modifiersBySource.get(power.id) ?? [],
    requirements: rulesetData.requirementsByEntity.get(power.id) ?? [],
  }));
  const virtualPowers: CustomizedPower[] = [];
  for (const { powerId, aptitudeId } of virtuallyPossessedPowers) {
    const powerRow = rulesetData.powersById.get(powerId);
    if (!powerRow) continue;
    const link = powerRow.powersAptitudesInRules.find((pa) => pa.aptitudeId === aptitudeId);
    if (!link) continue;
    virtualPowers.push({
      ...powerRow,
      klassLevelId: "",
      characterLevelId: "",
      aptitudeId,
      virtual: true,
      free: true,
      saveName: null,
      powerLevel: link.level,
      properties: rulesetData.propertiesByEntity.get(powerId) ?? [],
      modifiers: rulesetData.modifiersBySource.get(powerId) ?? [],
      requirements: rulesetData.requirementsByEntity.get(powerId) ?? [],
    });
  }
  return [...realPowers, ...virtualPowers];
}

/** The race with its properties, modifiers and requirements. */
export function toCustomizedRace(race: Race, rulesetData: RulesetData): CustomizedRace {
  return {
    ...race,
    properties: rulesetData.propertiesByEntity.get(race.id) ?? [],
    modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
    requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
  };
}
