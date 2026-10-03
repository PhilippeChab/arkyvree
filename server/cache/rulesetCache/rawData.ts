import { withCowContext } from "@/server/database/cowContext.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  Items,
  Klasses,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  KlassSkills,
  Languages,
  Mechanics,
  Modifiers,
  Powers,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
import type {
  Aptitude,
  FeatWithAptitudes,
  Item,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelPower,
  KlassLevelSave,
  KlassSkill,
  Language,
  Mechanic,
  Modifier,
  PowerWithAptitudes,
  Property,
  Race,
  Requirement,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/shared/relations.ts";

import DependentCache from "../DependentCache.ts";

export interface RulesetRawData {
  abilities: RulesetAbility[];
  saves: RulesetSave[];
  skills: Skill[];
  feats: FeatWithAptitudes[];
  powers: PowerWithAptitudes[];
  aptitudes: Aptitude[];
  klasses: Klass[];
  races: Race[];
  languages: Language[];
  items: Item[];
  mechanics: Mechanic[];
  klassLevels: KlassLevel[];
  klassSkills: KlassSkill[];
  klassLevelFeats: KlassLevelFeat[];
  klassLevelPowers: KlassLevelPower[];
  klassLevelSaves: KlassLevelSave[];
  leveledAptitudeIds: Set<string>;
  /** Every property row owned by this ruleset — all entityTypes. Consumers filter. */
  properties: Property[];
  /** Every modifier whose source is an entity in this ruleset — all sourceTypes. */
  modifiers: Modifier[];
  /** Every requirement row in this ruleset, including those attached to modifiers. */
  requirements: Requirement[];
}

export const rulesetRawDataCache = new DependentCache<RulesetRawData>();

function buildRawCacheKey(rulesetId: string, campaignId?: string): string {
  return campaignId ? `${rulesetId}:${campaignId}` : rulesetId;
}

async function fetchRulesetRawData(
  rulesetId: string,
  campaignId?: string,
): Promise<{ data: RulesetRawData; pinned: boolean }> {
  const findManyByRulesetId = campaignId
    ? { rulesetId, campaignId, ancestorRulesetIds: [] }
    : { rulesetId, ancestorRulesetIds: [] };

  // Round 1: fetch entities + ruleset metadata (for pin decision) in parallel.
  const [abilities, saves, skills, feats, powers, aptitudes, klasses, races, languages, items, mechanics, ruleset] =
    await Promise.all([
      Abilities.findAll((pagination) => Abilities.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Saves.findAll((pagination) => Saves.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Skills.findAll((pagination) => Skills.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Feats.findAll((pagination) => Feats.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Powers.findAll((pagination) => Powers.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Aptitudes.findAll((pagination) => Aptitudes.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Klasses.findAll((pagination) => Klasses.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Races.findAll((pagination) => Races.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Languages.findAll((pagination) => Languages.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Items.findAll((pagination) => Items.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      Mechanics.findAll((pagination) => Mechanics.findManyByRulesetId(db, findManyByRulesetId, pagination)),
      campaignId ? Promise.resolve(null) : Rulesets.findOne(db, { id: rulesetId }),
    ]);

  const klassIds = klasses.map((k) => k.id);

  // Round 2: klass sub-tables + leveled aptitudes (need klassIds / aptitudeIds).
  // Customizations wait until round 3 — they need klass-level IDs to pick up
  // properties/modifiers/requirements attached to class-level rows (KLASS_LEVEL_BAB,
  // KLASS_LEVEL_SKILL_POINTS, class-feature modifiers, etc.).
  const [klassLevels, klassSkills, leveledAptitudeIds] = await Promise.all([
    klassIds.length > 0 ? KlassLevels.findManyByKlassIds(db, { klassIds }) : Promise.resolve<KlassLevel[]>([]),
    klassIds.length > 0 ? KlassSkills.findMany(db, { klassIds }) : Promise.resolve<KlassSkill[]>([]),
    aptitudes.length > 0
      ? Aptitudes.findLeveledAptitudeIds(db, { aptitudeIds: aptitudes.map((a) => a.id) })
      : Promise.resolve(new Set<string>()),
  ]);

  const klassLevelIds = klassLevels.map((kl) => kl.id);

  // Round 3: customizations + klass-level sub-tables. Customizations include
  // everything keyed on entities (feats, powers, …), ruleset-level properties,
  // and klass-level rows now that we have klassLevelIds.
  const customizationEntityIds = [
    ...abilities.map((a) => a.id),
    ...saves.map((s) => s.id),
    ...skills.map((s) => s.id),
    ...feats.map((f) => f.id),
    ...powers.map((p) => p.id),
    ...aptitudes.map((a) => a.id),
    ...klasses.map((k) => k.id),
    ...races.map((r) => r.id),
    ...languages.map((l) => l.id),
    ...items.map((i) => i.id),
    ...mechanics.map((m) => m.id),
    ...klassLevelIds,
  ];
  const propertyEntityIds = [...customizationEntityIds, rulesetId];
  const [properties, modifiers, klassLevelFeats, klassLevelPowers, klassLevelSaves] = await Promise.all([
    propertyEntityIds.length > 0
      ? Properties.findManyByEntityIds(db, { entityIds: propertyEntityIds })
      : Promise.resolve<Property[]>([]),
    customizationEntityIds.length > 0
      ? Modifiers.findManyBySourceIds(db, { sourceIds: customizationEntityIds })
      : Promise.resolve<Modifier[]>([]),
    klassLevelIds.length > 0 ? KlassLevelFeats.findMany(db, { klassLevelIds }) : Promise.resolve<KlassLevelFeat[]>([]),
    klassLevelIds.length > 0
      ? KlassLevelPowers.findMany(db, { klassLevelIds })
      : Promise.resolve<KlassLevelPower[]>([]),
    klassLevelIds.length > 0 ? KlassLevelSaves.findMany(db, { klassLevelIds }) : Promise.resolve<KlassLevelSave[]>([]),
  ]);

  // Round 4: requirements (need modifier IDs for entityType='modifiers' lookups).
  const requirementEntityIds = [...customizationEntityIds, ...modifiers.map((m) => m.id)];
  const requirements =
    requirementEntityIds.length > 0
      ? await Requirements.findManyByEntityIds(db, { entityIds: requirementEntityIds })
      : [];

  const data: RulesetRawData = {
    abilities,
    saves,
    skills,
    feats,
    powers,
    aptitudes,
    klasses,
    races,
    languages,
    items,
    mechanics,
    klassLevels,
    klassSkills,
    klassLevelFeats,
    klassLevelPowers,
    klassLevelSaves,
    leveledAptitudeIds,
    properties,
    modifiers,
    requirements,
  };

  // Pin system-seeded rulesets (bases + extensions) BEFORE writing so the pin flag
  // is in place for the entry's whole lifetime — no window where eviction pressure
  // could knock it out. We use the `system` column rather than `userId IS NULL` so
  // orphaned user forks (userId nulled out by `Rulesets.orphan`) can't accidentally slip
  // into the pinned set. Only the non-campaign entry is eligible (system rulesets
  // are not campaign-scoped).
  return { data, pinned: !!ruleset?.system };
}

/**
 * Fetch entities owned by a single ruleset (no ancestor merging).
 * Pins the entry when the ruleset is system-seeded so bases and extensions
 * stay resident for all forks.
 */
export async function getOrFetchRulesetRawData(rulesetId: string, campaignId?: string): Promise<RulesetRawData> {
  const cacheKey = buildRawCacheKey(rulesetId, campaignId);
  return rulesetRawDataCache.getOrFetch(cacheKey, [rulesetId], () =>
    withCowContext(undefined, () => fetchRulesetRawData(rulesetId, campaignId)),
  );
}

/** Test/observability helper: whether a ruleset's raw cache entry is pinned. */
export function isRulesetRawDataPinned(rulesetId: string, campaignId?: string): boolean {
  return rulesetRawDataCache.isPinned(buildRawCacheKey(rulesetId, campaignId));
}
