/**
 * The lookup indices of a ruleset's composed view (`RulesetComposition`): rows by id, the customizations by entity,
 * source and property, the classes' levels and their grants, and the slugs modifier targets name entities by.
 */

import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type {
  Aptitude,
  FeatWithAptitudes,
  Modifier,
  PowerWithAptitudes,
  Property,
  Requirement,
  Skill,
} from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { RulesetRawData } from "./rawData.ts";

/** Rows by id. */
export function buildById<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * The customization indices over the composed (non-sibling) rows: properties by entity and by entity type,
 * modifiers by source and by id, requirements by entity, and the reverse property index — replaces O(N) scans like
 * `powers.filter(p => p.properties.some(x => x.type === TYPE && x.value === V))`, keyed
 * `${entityType}:${type}:${value}`.
 */
export function buildCustomizationIndices(properties: Property[], modifiers: Modifier[], requirements: Requirement[]) {
  const entityIdsByPropertyLookup = new Map<string, string[]>();
  for (const p of properties) {
    const key = `${p.entityType}:${p.type}:${p.value}`;
    const group = entityIdsByPropertyLookup.get(key);
    if (group) group.push(p.entityId);
    else entityIdsByPropertyLookup.set(key, [p.entityId]);
  }
  return {
    propertiesByEntity: Map.groupBy(properties, (p) => p.entityId),
    propertiesByEntityType: Map.groupBy(properties, (p) => p.entityType),
    modifiersBySource: Map.groupBy(modifiers, (m) => m.sourceId),
    modifiersById: buildById(modifiers),
    requirementsByEntity: Map.groupBy(requirements, (r) => r.entityId),
    entityIdsByPropertyLookup,
  };
}

/**
 * The class indices: levels by class (sorted by level) and by class and level, each class's highest level, and the
 * class levels' feats, powers and saves and the classes' skills, bare and joined with their entity — the joined shape
 * the repository queries used to return, resolved against the composed arrays without a DB trip.
 */
export function buildKlassIndices(
  rows: Pick<
    RulesetRawData,
    "klassLevels" | "klassSkills" | "klassLevelFeats" | "klassLevelPowers" | "klassLevelSaves"
  >,
  featsById: Map<string, FeatWithAptitudes>,
  powersById: Map<string, PowerWithAptitudes>,
  skillsById: Map<string, Skill>,
) {
  const { klassLevels, klassSkills, klassLevelFeats, klassLevelPowers, klassLevelSaves } = rows;
  const klassLevelsByKlassId = Map.groupBy(klassLevels, (kl) => kl.klassId);
  for (const group of klassLevelsByKlassId.values()) group.sort((a, b) => a.level - b.level);

  // Max level per klass, for level-up's "next available level".
  const maxLevelByKlassId = new Map<string, number>();
  for (const kl of klassLevels) {
    const current = maxLevelByKlassId.get(kl.klassId);
    if (current === undefined || kl.level > current) maxLevelByKlassId.set(kl.klassId, kl.level);
  }

  return {
    klassLevelByKlassAndLevel: new Map(klassLevels.map((kl) => [`${kl.klassId}:${kl.level}`, kl])),
    klassLevelsByKlassId,
    maxLevelByKlassId,
    klassLevelFeatsByKlassLevel: Map.groupBy(klassLevelFeats, (klf) => klf.klassLevelId),
    klassLevelPowersByKlassLevel: Map.groupBy(klassLevelPowers, (klp) => klp.klassLevelId),
    klassLevelSavesByKlassLevelId: Map.groupBy(klassLevelSaves, (kls) => kls.klassLevelId),
    klassSkillsByKlassId: Map.groupBy(klassSkills, (ks) => ks.klassId),
    klassLevelFeatsWithFeatsByKlassLevel: Map.groupBy(
      klassLevelFeats.flatMap((klf) => {
        const feat = featsById.get(klf.featId);
        return feat ? [{ ...klf, featsInRule: feat }] : [];
      }),
      (joined) => joined.klassLevelId,
    ),
    klassLevelPowersWithPowersByKlassLevel: Map.groupBy(
      klassLevelPowers.flatMap((klp) => {
        const power = powersById.get(klp.powerId);
        return power ? [{ ...klp, powersInRule: power }] : [];
      }),
      (joined) => joined.klassLevelId,
    ),
    klassSkillsWithSkillsByKlass: Map.groupBy(
      klassSkills.flatMap((ks) => {
        const skill = skillsById.get(ks.skillId);
        return skill ? [{ ...ks, skillsInRule: skill }] : [];
      }),
      (joined) => joined.klassId,
    ),
  };
}

/**
 * Slug indices — used by modifier target parsing (aptitudes.<slug>.…, feats.<slug>.possessed,
 * powers.<slug>.<apt>.known) and several inline map rebuilds across services that all derive the same slug→ID
 * mapping. Also the aptitudes that have a power linked, from the powers' inline `powersAptitudesInRules` rows.
 */
export function buildSlugIndices(aptitudes: Aptitude[], feats: FeatWithAptitudes[], powers: PowerWithAptitudes[]) {
  const featIdBySlug = new Map<string, string>();
  for (const feat of feats) {
    const slug = stripSeparators(feat.name);
    if (!featIdBySlug.has(slug)) featIdBySlug.set(slug, feat.id);
  }
  return {
    aptitudeIdBySlug: new Map(aptitudes.map((apt) => [stripSeparators(apt.name), apt.id])),
    aptitudeIdBySpellSlug: new Map(aptitudes.map((apt) => [toSpellPossessionSlug(apt.name), apt.id])),
    featIdBySlug,
    powerIdsBySlug: new Map(
      [...Map.groupBy(powers, (power) => stripSeparators(power.name))].map(([slug, group]) => [
        slug,
        group.map((power) => power.id),
      ]),
    ),
    aptitudeIdsByHavingPowers: new Set(
      powers.flatMap((power) => power.powersAptitudesInRules.map((l) => l.aptitudeId)),
    ),
  };
}
