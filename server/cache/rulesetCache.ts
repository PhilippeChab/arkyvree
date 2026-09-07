import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  Items,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevelSaves,
  KlassLevels,
  KlassSkills,
  Klasses,
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
import {
  type CowData,
  buildReqForest,
  collectTopLevelStandaloneKeys,
  dedupAgainstExisting,
  getOrBuildCowData as getOrBuildCowDataFromCow,
  invalidateAllCowData,
  invalidateCowData,
  resolveOverrides,
  serializeReqNode,
  type IdResolveMap,
} from "@/server/services/rulesets/cow.ts";
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
import type { TargetPath } from "@/shared/customization/target.ts";
import { spellPossessionSlug, stripSeparators } from "@/shared/utils.ts";
import MemoryCache from "./MemoryCache.ts";

// ──────────────────────────────────────────────────────────────
// COW data cache (delegates to cow.ts cache)
// ──────────────────────────────────────────────────────────────

export type CachedCowData = CowData;

/**
 * Cache helpers always read via the imported `db` (committed state). They never
 * accept a tx handle — that would let an in-progress mutation's uncommitted
 * writes leak into the global cache for every concurrent reader.
 */
async function getOrBuildCowData(
  ruleset: { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] },
): Promise<CachedCowData> {
  return getOrBuildCowDataFromCow(ruleset);
}

// ──────────────────────────────────────────────────────────────
// Per-ruleset raw data cache (tier 1)
// ──────────────────────────────────────────────────────────────

interface RulesetRawData {
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

const rulesetRawDataCache = new MemoryCache<RulesetRawData>();
/** Coalesces concurrent cache-miss fetches for the same key so only one 4-round
 *  DB trip runs at a time. Cleared once the fetch completes and the result is cached. */
const inFlightRawData = new Map<string, Promise<RulesetRawData>>();

function buildRawCacheKey(rulesetId: string, campaignId?: string): string {
  return campaignId ? `${rulesetId}:${campaignId}` : rulesetId;
}

/**
 * Fetch entities owned by a single ruleset (no ancestor merging).
 * Pins the entry when the ruleset is system-seeded so bases and extensions
 * stay resident for all forks.
 */
async function getOrFetchRulesetRawData(
  rulesetId: string,
  campaignId?: string,
): Promise<RulesetRawData> {
  const cacheKey = buildRawCacheKey(rulesetId, campaignId);
  const cached = rulesetRawDataCache.get(cacheKey);
  if (cached) return cached;

  // Coalesce concurrent misses — second request piggybacks on the first's promise.
  const inFlight = inFlightRawData.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = fetchRulesetRawData(rulesetId, cacheKey, campaignId);
  inFlightRawData.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRawData.delete(cacheKey);
  }
}

async function fetchRulesetRawData(
  rulesetId: string,
  cacheKey: string,
  campaignId?: string,
): Promise<RulesetRawData> {

  const findManyByRulesetId = campaignId
    ? { rulesetId, campaignId, ancestorRulesetIds: [] }
    : { rulesetId, ancestorRulesetIds: [] };

  // Round 1: fetch entities + ruleset metadata (for pin decision) in parallel.
  const [
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
    ruleset,
  ] = await Promise.all([
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
    klassIds.length > 0
      ? KlassLevels.findManyByKlassIds(db, { klassIds })
      : Promise.resolve<KlassLevel[]>([]),
    klassIds.length > 0
      ? KlassSkills.findMany(db, { klassIds })
      : Promise.resolve<KlassSkill[]>([]),
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
  const [properties, firstPassModifiers, klassLevelFeats, klassLevelPowers, klassLevelSaves] = await Promise.all([
    propertyEntityIds.length > 0
      ? Properties.findManyByEntityIds(db, { entityIds: propertyEntityIds })
      : Promise.resolve<Property[]>([]),
    customizationEntityIds.length > 0
      ? Modifiers.findManyBySourceIds(db, { sourceIds: customizationEntityIds })
      : Promise.resolve<Modifier[]>([]),
    klassLevelIds.length > 0
      ? KlassLevelFeats.findMany(db, { klassLevelIds })
      : Promise.resolve<KlassLevelFeat[]>([]),
    klassLevelIds.length > 0
      ? KlassLevelPowers.findMany(db, { klassLevelIds })
      : Promise.resolve<KlassLevelPower[]>([]),
    klassLevelIds.length > 0
      ? KlassLevelSaves.findMany(db, { klassLevelIds })
      : Promise.resolve<KlassLevelSave[]>([]),
  ]);

  // Nested modifiers (sourceType='modifiers', sourceId=anotherModifier.id) aren't
  // caught by the first pass since modifier IDs weren't in customizationEntityIds.
  // Fetch them now so ModifiersService.getEntityModifiers(..., "modifiers", id)
  // can resolve from the raw cache. Loop in case of deeper nesting.
  const modifiers = [...firstPassModifiers];
  const seenModifierIds = new Set(modifiers.map((m) => m.id));
  let frontier = modifiers.map((m) => m.id);
  while (frontier.length > 0) {
    const nested = await Modifiers.findManyBySourceIds(db, { sourceIds: frontier });
    const fresh = nested.filter((m) => !seenModifierIds.has(m.id));
    if (fresh.length === 0) break;
    for (const m of fresh) seenModifierIds.add(m.id);
    modifiers.push(...fresh);
    frontier = fresh.map((m) => m.id);
  }

  // Round 4: requirements (need modifier IDs for entityType='modifiers' lookups).
  const requirementEntityIds = [...customizationEntityIds, ...modifiers.map((m) => m.id)];
  const requirements = requirementEntityIds.length > 0
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
  // orphaned user forks (userId nulled out by orphanByUser) can't accidentally slip
  // into the pinned set. Only the non-campaign entry is eligible (system rulesets
  // are not campaign-scoped).
  if (ruleset?.system) {
    rulesetRawDataCache.pin(cacheKey);
  }
  rulesetRawDataCache.set(cacheKey, data);

  return data;
}

// ──────────────────────────────────────────────────────────────
// Composed ruleset data (backward-compatible API)
// ──────────────────────────────────────────────────────────────

/**
 * Wraps a string-keyed Map so `.get(key)` and `.has(key)` auto-resolve the
 * key through `overrideMap` before hitting the underlying Map. Consumers
 * can pass either a pre-COW (stored) id or a post-COW id — both land on
 * the post-COW entity. `.size`, `.values()`, `.entries()`, etc. behave
 * normally (no alias duplication).
 *
 * Returns the original Map when overrideMap is empty (no allocation cost).
 */
function cowResolvingMap<V>(map: Map<string, V>, overrideMap: IdResolveMap): Map<string, V> {
  if (overrideMap.size === 0) return map;
  return new Proxy(map, {
    get(target, prop) {
      if (prop === "get") {
        return (key: string) => target.get(overrideMap.get(key) ?? key);
      }
      if (prop === "has") {
        return (key: string) => target.has(overrideMap.get(key) ?? key);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Variant of cowResolvingMap for Maps keyed by `${id}:${rest}` composites
 * (e.g. `klassLevelByKlassAndLevel`'s `${klassId}:${level}` keys). Resolves
 * the id portion before the first `:` through the override map, leaves the
 * rest untouched. So a caller passing a pre-COW klassId still lands on the
 * right klass level.
 */
function cowResolvingCompositeKeyMap<V>(map: Map<string, V>, overrideMap: IdResolveMap): Map<string, V> {
  if (overrideMap.size === 0) return map;
  const resolveKey = (key: string): string => {
    const sep = key.indexOf(":");
    if (sep === -1) return key;
    const idPart = key.slice(0, sep);
    const resolved = overrideMap.get(idPart);
    return resolved ? resolved + key.slice(sep) : key;
  };
  return new Proxy(map, {
    get(target, prop) {
      if (prop === "get") {
        return (key: string) => target.get(resolveKey(key));
      }
      if (prop === "has") {
        return (key: string) => target.has(resolveKey(key));
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export interface CachedRulesetData {
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

  // ── O(1) lookup indices built from the arrays above ──────────────
  // Consumers that used to do `Feats.findOne(db, {id})` / `Properties.findManyByEntity(db, ...)`
  // can read directly from these maps (cache is always warm on character/level paths).
  abilitiesById: Map<string, RulesetAbility>;
  savesById: Map<string, RulesetSave>;
  skillsById: Map<string, Skill>;
  featsById: Map<string, FeatWithAptitudes>;
  powersById: Map<string, PowerWithAptitudes>;
  aptitudesById: Map<string, Aptitude>;
  klassesById: Map<string, Klass>;
  racesById: Map<string, Race>;
  languagesById: Map<string, Language>;
  itemsById: Map<string, Item>;
  mechanicsById: Map<string, Mechanic>;
  klassLevelsById: Map<string, KlassLevel>;
  /** Key: `${klassId}:${level}`. Replaces `KlassLevels.findOneByKlassAndLevel`. */
  klassLevelByKlassAndLevel: Map<string, KlassLevel>;
  /** klassId → klassLevels[] sorted by level. Replaces `KlassLevels.findManyByKlass`. */
  klassLevelsByKlassId: Map<string, KlassLevel[]>;
  /** entityId → properties[]. Replaces `Properties.findManyByEntity`. */
  propertiesByEntity: Map<string, Property[]>;
  /** entityType → properties[] (e.g. "items" → all item properties across the chain).
   *  Covers the "group properties by entity type" pattern TargetPaths needs. */
  propertiesByEntityType: Map<string, Property[]>;
  /** klassLevelId → klassLevelFeats[]. */
  klassLevelFeatsByKlassLevel: Map<string, KlassLevelFeat[]>;
  /** klassLevelId → klassLevelPowers[]. */
  klassLevelPowersByKlassLevel: Map<string, KlassLevelPower[]>;
  /** klassLevelId → klassLevelFeats joined with their feats.
   *  Replaces `KlassLevelFeats.findManyWithFeats`. */
  klassLevelFeatsWithFeatsByKlassLevel: Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]>;
  /** klassLevelId → klassLevelPowers joined with their powers.
   *  Replaces `KlassLevelPowers.findManyWithPowers`. */
  klassLevelPowersWithPowersByKlassLevel: Map<string, (KlassLevelPower & { powersInRule: PowerWithAptitudes })[]>;
  /** klassId → klassSkills joined with their skills.
   *  Replaces `KlassSkills.findManyWithSkills`. */
  klassSkillsWithSkillsByKlass: Map<string, (KlassSkill & { skillsInRule: Skill })[]>;
  /** Aptitude IDs that have at least one power linked in powers_aptitudes.
   *  Replaces `PowersAptitudes.findDistinctAptitudeIds`. */
  aptitudeIdsByHavingPowers: Set<string>;
  /** Modifier rows indexed by sourceId. Replaces ruleset-scoped
   *  `Modifiers.findManyBySource` / `findManyBySourceIds`. */
  modifiersBySource: Map<string, Modifier[]>;
  /** Modifier rows indexed by id. Replaces ruleset-scoped `Modifiers.findOne`. */
  modifiersById: Map<string, Modifier>;
  /** Requirement rows (non-sibling) indexed by entityId.
   *  Replaces ruleset-scoped `Requirements.findManyByEntity*`. */
  requirementsByEntity: Map<string, Requirement[]>;
  /** Reverse property index: `${entityType}:${type}:${value}` → entity IDs
   *  matching that property. Replaces `Properties.findEntityIdsByPropertyValues`.
   *  Stays ruleset-agnostic — any (entityType, type, value) triple can be looked up. */
  entityIdsByPropertyLookup: Map<string, string[]>;
  /** klassId → highest `level` among that klass's klass levels. Replaces
   *  `KlassLevels.findMaxLevelByKlassIds` on the level-up class-browse path. */
  maxLevelByKlassId: Map<string, number>;
  /** klassId → klassSkills[] (bare rows, unjoined).
   *  Complements `klassSkillsWithSkillsByKlass` for callers that only need the link rows. */
  klassSkillsByKlassId: Map<string, KlassSkill[]>;
  /** klassLevelId → klassLevelSaves[]. Replaces `klassLevelSaves.filter(by klassLevelId)`. */
  klassLevelSavesByKlassLevelId: Map<string, KlassLevelSave[]>;
  /** `stripSeparators(aptitude.name)` → aptitudeId. Killed off 4+ inline rebuilds
   *  of the same map across services (finalize, distribution, pickQueries, loader). */
  aptitudeIdBySlug: Map<string, string>;
  /** `spellPossessionSlug(aptitude.name)` → aptitudeId. Used by the "set powers.X.<apt>.known"
   *  modifier scan in the virtually-possessed-power resolution path. */
  aptitudeIdBySpellSlug: Map<string, string>;
  /** `stripSeparators(feat.name)` → featId (first match wins, matching the original `.find`).
   *  Used by the "set feats.<slug>.possessed" modifier scan. */
  featIdBySlug: Map<string, string>;
  /** `stripSeparators(power.name)` → powerIds[] (multiple powers can share a slug).
   *  Resolve via `powersById` — mirrors the `featIdBySlug`/`featsById` pairing.
   *  Used by the "set powers.<slug>.<apt>.known" modifier scan. */
  powerIdsBySlug: Map<string, string[]>;
  /** Resolve a stored (pre-COW) entity id to its post-COW form. Returns the
   *  input unchanged if it isn't in the override map. Use this for Set/array
   *  comparison patterns where the `.get`/`.has` auto-resolution on the id
   *  Maps above doesn't apply. */
  canonicalize: (id: string) => string;
  /** COW context. Most consumers can ignore this and let the id Maps auto-
   *  resolve, but lineage/sibling-aware code can reach it through here
   *  without taking `cowData` as a separate parameter. */
  cow: CachedCowData;
}

/**
 * Get composed ruleset entity data for a fork. Combines the fork's own entities
 * with each ancestor in the source chain, applying COW exclusions, sibling filtering,
 * and FK override resolution. Ancestor data is pulled from the pinned tier-1 cache.
 */
async function getOrFetchRulesetData(
  rulesetId: string,
  cowData: CachedCowData,
  campaignId?: string,
): Promise<CachedRulesetData> {
  const [forkRaw, ...ancestorRaws] = await Promise.all([
    getOrFetchRulesetRawData(rulesetId, campaignId),
    ...cowData.sourceChain.map((id) => getOrFetchRulesetRawData(id)),
  ]);
  const chain = [forkRaw, ...ancestorRaws];

  // Compose-skip uses overrideMap (true overrides only — keys are
  // sourceEntityIds whose data is replaced by a child COW). Sibling losers
  // are filtered separately via siblingIds; their customizations need to
  // merge into the winner, not be skipped wholesale.
  const overriddenIds = cowData.overrideMap;
  const siblingIds = cowData.siblingIds;
  const isExcluded = (id: string) => overriddenIds.has(id) || siblingIds.has(id);
  // FK / id remapping (used by `wrap` and `resolveOverrides`) uses idResolveMap:
  // overrides + aptitude losers + snapshot sibling losers. Anything callers
  // hand in via stored ids should be remapped to the canonical winner.
  const idResolveMap = cowData.idResolveMap;

  const compose = <T extends { id: string }>(pick: (r: RulesetRawData) => T[]): T[] => {
    const merged: T[] = [];
    for (const raw of chain) {
      for (const item of pick(raw)) {
        if (!isExcluded(item.id)) merged.push(item);
      }
    }
    return merged;
  };

  const abilities = compose((r) => r.abilities);
  const saves = compose((r) => r.saves);
  const skills = compose((r) => r.skills);
  const feats = compose((r) => r.feats);
  const powers = compose((r) => r.powers);
  const aptitudes = compose((r) => r.aptitudes);
  const klasses = compose((r) => r.klasses);
  const races = compose((r) => r.races);
  const languages = compose((r) => r.languages);
  const items = compose((r) => r.items);
  const mechanics = compose((r) => r.mechanics);

  // Klass levels: `overrideMap` carries klass-level id pairs for COW'd klasses
  // (back-filled by cow.ts after `buildOverrideMap`), so isExcluded covers both
  // entity-level and klass-level IDs uniformly. Additionally drop levels whose
  // parent klass is a sibling loser — siblingIds only has klass IDs, not klass-
  // level IDs.
  const visibleKlassIds = new Set(klasses.map((k) => k.id));
  const klassLevels = compose((r) => r.klassLevels).filter((kl) => visibleKlassIds.has(kl.klassId));
  const visibleKlassLevelIds = new Set(klassLevels.map((kl) => kl.id));

  // Klass sub-tables: filter by parent klass-level visibility. klassSkills
  // belongs to klasses directly, so filter by visible klass IDs.
  const klassSkills: KlassSkill[] = [];
  for (const raw of chain) {
    for (const ks of raw.klassSkills) {
      if (visibleKlassIds.has(ks.klassId)) klassSkills.push(ks);
    }
  }
  const klassLevelFeats: KlassLevelFeat[] = [];
  const klassLevelPowers: KlassLevelPower[] = [];
  const klassLevelSaves: KlassLevelSave[] = [];
  for (const raw of chain) {
    for (const klf of raw.klassLevelFeats) {
      if (visibleKlassLevelIds.has(klf.klassLevelId)) klassLevelFeats.push(klf);
    }
    for (const klp of raw.klassLevelPowers) {
      if (visibleKlassLevelIds.has(klp.klassLevelId)) klassLevelPowers.push(klp);
    }
    for (const kls of raw.klassLevelSaves) {
      if (visibleKlassLevelIds.has(kls.klassLevelId)) klassLevelSaves.push(kls);
    }
  }

  // Reverse sibling index for O(1) winner lookup from a sibling id.
  const siblingToWinner = new Map<string, string>();
  for (const [winnerId, sibs] of cowData.siblingMap) {
    for (const sid of sibs) siblingToWinner.set(sid, winnerId);
  }

  // Properties: concat, remap sibling props to winner entityId, dedup (type|value)
  // within each winner group. Ruleset-level properties (entityId === rulesetId) are
  // never excluded because ruleset IDs aren't in overrideMap. Also drop klass-
  // level properties whose parent klass is a sibling loser — those klass levels
  // have already been filtered out of `klassLevels`, so their props would be
  // orphans in `propertiesByEntity`.
  const properties: Property[] = [];
  const propDedupByWinner = new Map<string, Set<string>>();
  for (const raw of chain) {
    for (const prop of raw.properties) {
      if (overriddenIds.has(prop.entityId)) continue;
      if (prop.entityType === "klass_levels" && !visibleKlassLevelIds.has(prop.entityId)) continue;
      const winnerId = siblingToWinner.get(prop.entityId);
      if (winnerId) {
        const key = `${prop.type}|${prop.value}`;
        const seen = propDedupByWinner.get(winnerId) ?? new Set<string>();
        if (seen.has(key)) continue;
        seen.add(key);
        propDedupByWinner.set(winnerId, seen);
        properties.push({ ...prop, entityId: winnerId });
      } else {
        properties.push(prop);
        if (cowData.siblingMap.has(prop.entityId)) {
          const seen = propDedupByWinner.get(prop.entityId) ?? new Set<string>();
          seen.add(`${prop.type}|${prop.value}`);
          propDedupByWinner.set(prop.entityId, seen);
        }
      }
    }
  }

  // Modifiers: drop when the source was COW'd. Sibling-sourced modifiers are
  // merged into the winner's bucket with sourceId remapped, deduped by
  // target|value|operator|valueType. Sibling mods that dedup-skip have their
  // ids recorded in excludedModifierIds so their requirements drop too.
  const modifiers: Modifier[] = [];
  const excludedModifierIds = new Set<string>();
  const modDedupByWinner = new Map<string, Set<string>>();
  for (const raw of chain) {
    for (const m of raw.modifiers) {
      if (overriddenIds.has(m.sourceId)) {
        excludedModifierIds.add(m.id);
        continue;
      }
      if (m.sourceType === "klass_levels" && !visibleKlassLevelIds.has(m.sourceId)) {
        excludedModifierIds.add(m.id);
        continue;
      }
      const winnerId = siblingToWinner.get(m.sourceId);
      if (winnerId) {
        const key = `${m.target}|${m.value}|${m.operator}|${m.valueType}`;
        const seen = modDedupByWinner.get(winnerId) ?? new Set<string>();
        if (seen.has(key)) {
          excludedModifierIds.add(m.id);
          continue;
        }
        seen.add(key);
        modDedupByWinner.set(winnerId, seen);
        modifiers.push({ ...m, sourceId: winnerId });
      } else {
        modifiers.push(m);
        if (cowData.siblingMap.has(m.sourceId)) {
          const seen = modDedupByWinner.get(m.sourceId) ?? new Set<string>();
          seen.add(`${m.target}|${m.value}|${m.operator}|${m.valueType}`);
          modDedupByWinner.set(m.sourceId, seen);
        }
      }
    }
  }

  // Requirements: entityType='modifiers' rows survive when their modifier wasn't
  // excluded (keyed by modifier.id). Entity-level rows go through the same
  // recursive forest merge that mergeSiblingData uses at write time:
  //   - Build the winner's forest from its own reqs
  //   - For each sibling, build its forest, dedup leaves against existing
  //     conditions on the winner, and append each tree at a fresh top-level
  //     position with renumbered child paths.
  // The result is the same in-memory list shape as before.
  const requirements: Requirement[] = [];
  // Group winner-side rows by winnerId so we can build forests per entity.
  const winnerOwnReqs = new Map<string, Requirement[]>();
  // Group sibling rows by (winner, sibling source entity) to preserve each
  // sibling's tree identity during the merge.
  const siblingReqsByWinner = new Map<string, Map<string, Requirement[]>>();

  for (const raw of chain) {
    for (const r of raw.requirements) {
      if (r.entityType === "modifiers") {
        if (!excludedModifierIds.has(r.entityId)) requirements.push(r);
        continue;
      }
      if (overriddenIds.has(r.entityId)) continue;
      if (r.entityType === "klass_levels" && !visibleKlassLevelIds.has(r.entityId)) continue;
      const winnerId = siblingToWinner.get(r.entityId);
      if (winnerId) {
        if (!siblingReqsByWinner.has(winnerId)) siblingReqsByWinner.set(winnerId, new Map());
        const bySibling = siblingReqsByWinner.get(winnerId)!;
        if (!bySibling.has(r.entityId)) bySibling.set(r.entityId, []);
        bySibling.get(r.entityId)!.push(r);
      } else {
        requirements.push(r);
        if (!winnerOwnReqs.has(r.entityId)) winnerOwnReqs.set(r.entityId, []);
        winnerOwnReqs.get(r.entityId)!.push(r);
      }
    }
  }

  // Merge each sibling's forest into the winner. Dedup is semantic — drop
  // sibling-tree leaves that duplicate a top-level standalone on the winner
  // (the AND already forces them; redundant in the new chain). Identical
  // conditions across distinct chains are preserved (schema permits this).
  for (const [winnerId, bySibling] of siblingReqsByWinner) {
    const winnerReqs = winnerOwnReqs.get(winnerId) ?? [];
    const winnerForest = buildReqForest(winnerReqs);
    const standaloneKeys = collectTopLevelStandaloneKeys(winnerForest);
    const usedLevels = new Set(winnerReqs.map((r) => r.level));
    let maxTopInt = 0;
    for (const r of winnerReqs) {
      const m = /^(\d+)$/.exec(r.level);
      if (m) maxTopInt = Math.max(maxTopInt, parseInt(m[1], 10));
    }

    for (const [, sibReqs] of bySibling) {
      const sibForest = buildReqForest(sibReqs);
      for (const tree of sibForest) {
        const deduped = dedupAgainstExisting(tree, standaloneKeys);
        if (!deduped) continue;

        let level: string;
        if (deduped.kind === "chain") {
          maxTopInt++;
          level = String(maxTopInt);
        } else {
          // Top-level standalone leaf — try to preserve the sibling's original
          // level, suffix on collision.
          const originalRow = sibReqs.find((r) =>
            !r.chainingOperator && r.target === deduped.target
            && r.operator === deduped.operator && r.value === deduped.value,
          );
          const originalLevel = originalRow?.level;
          if (originalLevel) {
            level = originalLevel;
            let suffix = 2;
            while (usedLevels.has(level)) level = `${originalLevel}-${suffix++}`;
          } else {
            maxTopInt++;
            level = String(maxTopInt);
          }
        }

        const serialized = serializeReqNode(deduped, level, winnerId, sibReqs[0].entityType);
        for (const row of serialized) {
          usedLevels.add(row.level);
          requirements.push({
            id: `synthetic-${winnerId}-${row.level}`,
            entityId: row.entityId,
            entityType: row.entityType,
            level: row.level,
            target: row.target ?? null,
            operator: row.operator ?? null,
            value: row.value ?? null,
            valueType: row.valueType ?? null,
            chainingOperator: row.chainingOperator ?? null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          } as Requirement);
        }
        if (deduped.kind === "leaf") {
          standaloneKeys.add(`${deduped.target}|${deduped.operator}|${deduped.value}`);
        }
      }
    }
  }

  // Leveled aptitude IDs: union across visible aptitudes.
  const leveledAptitudeIds = new Set<string>();
  for (const raw of chain) {
    for (const id of raw.leveledAptitudeIds) {
      if (!isExcluded(id)) leveledAptitudeIds.add(id);
    }
  }

  const hasOverrides = idResolveMap.size > 0;
  const resolvedAbilities = hasOverrides ? resolveOverrides(abilities, idResolveMap) : abilities;
  const resolvedSaves = hasOverrides ? resolveOverrides(saves, idResolveMap) : saves;
  const resolvedSkills = hasOverrides ? resolveOverrides(skills, idResolveMap) : skills;
  const resolvedFeats = hasOverrides ? resolveOverrides(feats, idResolveMap) : feats;
  const resolvedPowers = hasOverrides ? resolveOverrides(powers, idResolveMap) : powers;
  const resolvedAptitudes = hasOverrides ? resolveOverrides(aptitudes, idResolveMap) : aptitudes;
  const resolvedKlasses = hasOverrides ? resolveOverrides(klasses, idResolveMap) : klasses;
  const resolvedRaces = hasOverrides ? resolveOverrides(races, idResolveMap) : races;
  const resolvedLanguages = hasOverrides ? resolveOverrides(languages, idResolveMap) : languages;
  const resolvedItems = hasOverrides ? resolveOverrides(items, idResolveMap) : items;
  const resolvedMechanics = hasOverrides ? resolveOverrides(mechanics, idResolveMap) : mechanics;
  const resolvedKlassLevels = hasOverrides ? resolveOverrides(klassLevels, idResolveMap) : klassLevels;
  const resolvedKlassSkills = hasOverrides ? resolveOverrides(klassSkills, idResolveMap) : klassSkills;
  const resolvedKlassLevelFeats = hasOverrides ? resolveOverrides(klassLevelFeats, idResolveMap) : klassLevelFeats;
  const resolvedKlassLevelPowers = hasOverrides ? resolveOverrides(klassLevelPowers, idResolveMap) : klassLevelPowers;
  const resolvedKlassLevelSaves = hasOverrides ? resolveOverrides(klassLevelSaves, idResolveMap) : klassLevelSaves;

  // Collect sibling aptitude links (keyed by winner id, featId/powerId already
  // remapped to winner) so they can be merged into the winner's inline
  // aptitudes-in-rule array alongside the FK remap pass below. Built once
  // here from the raw chain because compose filters out sibling entities
  // before this point.
  const siblingFeatLinksByWinner = new Map<string, typeof resolvedFeats[number]["featsAptitudesInRules"]>();
  const siblingPowerLinksByWinner = new Map<string, typeof resolvedPowers[number]["powersAptitudesInRules"]>();
  if (cowData.siblingMap.size > 0) {
    for (const raw of chain) {
      for (const f of raw.feats) {
        const w = siblingToWinner.get(f.id);
        if (!w) continue;
        const remapped = f.featsAptitudesInRules.map((l) => ({ ...l, featId: w }));
        const g = siblingFeatLinksByWinner.get(w);
        if (g) g.push(...remapped);
        else siblingFeatLinksByWinner.set(w, remapped);
      }
      for (const p of raw.powers) {
        const w = siblingToWinner.get(p.id);
        if (!w) continue;
        const remapped = p.powersAptitudesInRules.map((l) => ({ ...l, powerId: w }));
        const g = siblingPowerLinksByWinner.get(w);
        if (g) g.push(...remapped);
        else siblingPowerLinksByWinner.set(w, remapped);
      }
    }
  }

  // Resolve IDs nested inside the feat/power join arrays. `resolveOverrides`
  // above only touches top-level string fields; the inline
  // powersAptitudesInRules / featsAptitudesInRules arrays still hold pre-COW
  // aptitudeIds + pre-COW Aptitude join objects after a sibling-dedup or
  // aptitude COW. Downstream consumers compare these against post-COW IDs
  // from the composed cache (`pa.aptitudeId === rulesetData.aptitudesById...`)
  // and silently miss. Walk the arrays once here so every `aptitudeId`,
  // `powerId`, `featId`, and `aptitudesInRule` entry is post-COW. Also merge
  // sibling aptitude links here; dedup by resolved aptitudeId so sibling
  // duplicates collapse naturally.
  // Siblings always imply entries in overrideMap (buildOverrideMap puts sourceId
  // → winnerForkedId for extension-COW siblings; aptitude dedup puts loser →
  // winner for aptitude siblings). So `hasOverrides` covers both cases and the
  // shallow-copied `resolvedFeats`/`resolvedPowers` are safe to mutate.
  if (hasOverrides) {
    const aptitudesByIdMap = new Map<string, Aptitude>();
    for (const apt of resolvedAptitudes) aptitudesByIdMap.set(apt.id, apt);

    for (const feat of resolvedFeats) {
      const sibLinks = siblingFeatLinksByWinner.get(feat.id);
      const source = sibLinks ? [...feat.featsAptitudesInRules, ...sibLinks] : feat.featsAptitudesInRules;
      const seen = new Set<string>();
      const rewritten: typeof feat.featsAptitudesInRules = [];
      for (const link of source) {
        const resolvedAptId = idResolveMap.get(link.aptitudeId) ?? link.aptitudeId;
        if (seen.has(resolvedAptId)) continue;
        seen.add(resolvedAptId);
        const resolvedFeatId = idResolveMap.get(link.featId) ?? link.featId;
        const aptitudesInRule = aptitudesByIdMap.get(resolvedAptId) ?? link.aptitudesInRule;
        rewritten.push({ ...link, aptitudeId: resolvedAptId, featId: resolvedFeatId, aptitudesInRule });
      }
      feat.featsAptitudesInRules = rewritten;
    }

    for (const power of resolvedPowers) {
      const sibLinks = siblingPowerLinksByWinner.get(power.id);
      const source = sibLinks ? [...power.powersAptitudesInRules, ...sibLinks] : power.powersAptitudesInRules;
      const seen = new Set<string>();
      const rewritten: typeof power.powersAptitudesInRules = [];
      for (const link of source) {
        const resolvedAptId = idResolveMap.get(link.aptitudeId) ?? link.aptitudeId;
        if (seen.has(resolvedAptId)) continue;
        seen.add(resolvedAptId);
        const resolvedPowerId = idResolveMap.get(link.powerId) ?? link.powerId;
        const aptitudesInRule = aptitudesByIdMap.get(resolvedAptId) ?? link.aptitudesInRule;
        rewritten.push({ ...link, aptitudeId: resolvedAptId, powerId: resolvedPowerId, aptitudesInRule });
      }
      power.powersAptitudesInRules = rewritten;
    }
  }

  // ── Build lookup indices over the composed arrays ──
  const buildById = <T extends { id: string }>(list: T[]): Map<string, T> => {
    const m = new Map<string, T>();
    for (const item of list) m.set(item.id, item);
    return m;
  };

  const klassLevelByKlassAndLevel = new Map<string, KlassLevel>();
  const klassLevelsByKlassId = new Map<string, KlassLevel[]>();
  for (const kl of resolvedKlassLevels) {
    klassLevelByKlassAndLevel.set(`${kl.klassId}:${kl.level}`, kl);
    const group = klassLevelsByKlassId.get(kl.klassId);
    if (group) group.push(kl);
    else klassLevelsByKlassId.set(kl.klassId, [kl]);
  }
  for (const group of klassLevelsByKlassId.values()) {
    group.sort((a, b) => a.level - b.level);
  }

  const propertiesByEntity = new Map<string, Property[]>();
  const propertiesByEntityType = new Map<string, Property[]>();
  for (const p of properties) {
    const group = propertiesByEntity.get(p.entityId);
    if (group) group.push(p);
    else propertiesByEntity.set(p.entityId, [p]);
    const typeGroup = propertiesByEntityType.get(p.entityType);
    if (typeGroup) typeGroup.push(p);
    else propertiesByEntityType.set(p.entityType, [p]);
  }

  const klassLevelFeatsByKlassLevel = new Map<string, KlassLevelFeat[]>();
  for (const klf of resolvedKlassLevelFeats) {
    const group = klassLevelFeatsByKlassLevel.get(klf.klassLevelId);
    if (group) group.push(klf);
    else klassLevelFeatsByKlassLevel.set(klf.klassLevelId, [klf]);
  }

  const klassLevelPowersByKlassLevel = new Map<string, KlassLevelPower[]>();
  for (const klp of resolvedKlassLevelPowers) {
    const group = klassLevelPowersByKlassLevel.get(klp.klassLevelId);
    if (group) group.push(klp);
    else klassLevelPowersByKlassLevel.set(klp.klassLevelId, [klp]);
  }

  // Join-result maps — build the joined shape the repository queries used to
  // return. Lookups now resolve against the composed arrays without a DB trip.
  const featsByIdLookup = buildById(resolvedFeats);
  const powersByIdLookup = buildById(resolvedPowers);
  const skillsByIdLookup = buildById(resolvedSkills);

  const klassLevelFeatsWithFeatsByKlassLevel = new Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]>();
  for (const klf of resolvedKlassLevelFeats) {
    const feat = featsByIdLookup.get(klf.featId);
    if (!feat) continue;
    const group = klassLevelFeatsWithFeatsByKlassLevel.get(klf.klassLevelId);
    const joined = { ...klf, featsInRule: feat };
    if (group) group.push(joined);
    else klassLevelFeatsWithFeatsByKlassLevel.set(klf.klassLevelId, [joined]);
  }

  const klassLevelPowersWithPowersByKlassLevel = new Map<string, (KlassLevelPower & { powersInRule: PowerWithAptitudes })[]>();
  for (const klp of resolvedKlassLevelPowers) {
    const power = powersByIdLookup.get(klp.powerId);
    if (!power) continue;
    const group = klassLevelPowersWithPowersByKlassLevel.get(klp.klassLevelId);
    const joined = { ...klp, powersInRule: power };
    if (group) group.push(joined);
    else klassLevelPowersWithPowersByKlassLevel.set(klp.klassLevelId, [joined]);
  }

  const klassSkillsWithSkillsByKlass = new Map<string, (KlassSkill & { skillsInRule: Skill })[]>();
  for (const ks of resolvedKlassSkills) {
    const skill = skillsByIdLookup.get(ks.skillId);
    if (!skill) continue;
    const group = klassSkillsWithSkillsByKlass.get(ks.klassId);
    const joined = { ...ks, skillsInRule: skill };
    if (group) group.push(joined);
    else klassSkillsWithSkillsByKlass.set(ks.klassId, [joined]);
  }

  // Set of aptitude IDs that have any power linked — derived from the inline
  // `powersAptitudesInRules` rows on PowerWithAptitudes.
  const aptitudeIdsByHavingPowers = new Set<string>();
  for (const power of resolvedPowers) {
    for (const link of power.powersAptitudesInRules) {
      aptitudeIdsByHavingPowers.add(link.aptitudeId);
    }
  }

  // Modifier-by-source and requirement-by-entity indices over the composed
  // (non-sibling) rows. Sibling variants are exposed separately.
  const modifiersBySource = new Map<string, Modifier[]>();
  const modifiersById = new Map<string, Modifier>();
  for (const m of modifiers) {
    const group = modifiersBySource.get(m.sourceId);
    if (group) group.push(m);
    else modifiersBySource.set(m.sourceId, [m]);
    modifiersById.set(m.id, m);
  }

  const requirementsByEntity = new Map<string, Requirement[]>();
  for (const r of requirements) {
    const group = requirementsByEntity.get(r.entityId);
    if (group) group.push(r);
    else requirementsByEntity.set(r.entityId, [r]);
  }

  // Reverse property index — replaces O(N) scans like
  // `powers.filter(p => p.properties.some(x => x.type === TYPE && x.value === V))`.
  // Key format: `${entityType}:${type}:${value}`.
  const entityIdsByPropertyLookup = new Map<string, string[]>();
  for (const p of properties) {
    const key = `${p.entityType}:${p.type}:${p.value}`;
    const group = entityIdsByPropertyLookup.get(key);
    if (group) group.push(p.entityId);
    else entityIdsByPropertyLookup.set(key, [p.entityId]);
  }

  // Max level per klass (for level-up's "next available level" computation) and
  // per-klass klass-skills bare-row index.
  const maxLevelByKlassId = new Map<string, number>();
  for (const kl of resolvedKlassLevels) {
    const current = maxLevelByKlassId.get(kl.klassId);
    if (current === undefined || kl.level > current) {
      maxLevelByKlassId.set(kl.klassId, kl.level);
    }
  }
  const klassSkillsByKlassId = new Map<string, KlassSkill[]>();
  for (const ks of resolvedKlassSkills) {
    const group = klassSkillsByKlassId.get(ks.klassId);
    if (group) group.push(ks);
    else klassSkillsByKlassId.set(ks.klassId, [ks]);
  }
  const klassLevelSavesByKlassLevelId = new Map<string, KlassLevelSave[]>();
  for (const kls of resolvedKlassLevelSaves) {
    const group = klassLevelSavesByKlassLevelId.get(kls.klassLevelId);
    if (group) group.push(kls);
    else klassLevelSavesByKlassLevelId.set(kls.klassLevelId, [kls]);
  }

  // Slug indices — used by modifier target parsing (aptitudes.<slug>.…,
  // feats.<slug>.possessed, powers.<slug>.<apt>.known) and several inline
  // map rebuilds across services that all derive the same slug→ID mapping.
  const aptitudeIdBySlug = new Map<string, string>();
  const aptitudeIdBySpellSlug = new Map<string, string>();
  for (const apt of resolvedAptitudes) {
    aptitudeIdBySlug.set(stripSeparators(apt.name), apt.id);
    aptitudeIdBySpellSlug.set(spellPossessionSlug(apt.name), apt.id);
  }
  const featIdBySlug = new Map<string, string>();
  for (const feat of resolvedFeats) {
    const slug = stripSeparators(feat.name);
    if (!featIdBySlug.has(slug)) featIdBySlug.set(slug, feat.id);
  }
  const powerIdsBySlug = new Map<string, string[]>();
  for (const power of resolvedPowers) {
    const slug = stripSeparators(power.name);
    const group = powerIdsBySlug.get(slug);
    if (group) group.push(power.id);
    else powerIdsBySlug.set(slug, [power.id]);
  }

  // Wrap every id-keyed Map so `.get(storedId)` / `.has(storedId)` auto-resolve
  // pre-COW ids to the post-COW entity. Consumers don't need to thread cowData
  // through or remember to call canonicalize for the common lookup path.
  // Composite-key Maps (e.g. klassLevelByKlassAndLevel) use a specialized
  // wrapper that canonicalizes the id portion before the first `:`.
  const wrap = <V>(map: Map<string, V>) => cowResolvingMap(map, idResolveMap);

  return {
    abilities: resolvedAbilities,
    saves: resolvedSaves,
    skills: resolvedSkills,
    feats: resolvedFeats,
    powers: resolvedPowers,
    aptitudes: resolvedAptitudes,
    klasses: resolvedKlasses,
    races: resolvedRaces,
    languages: resolvedLanguages,
    items: resolvedItems,
    mechanics: resolvedMechanics,
    klassLevels: resolvedKlassLevels,
    klassSkills: resolvedKlassSkills,
    klassLevelFeats: resolvedKlassLevelFeats,
    klassLevelPowers: resolvedKlassLevelPowers,
    klassLevelSaves: resolvedKlassLevelSaves,
    leveledAptitudeIds,
    abilitiesById: wrap(buildById(resolvedAbilities)),
    savesById: wrap(buildById(resolvedSaves)),
    skillsById: wrap(skillsByIdLookup),
    featsById: wrap(featsByIdLookup),
    powersById: wrap(powersByIdLookup),
    aptitudesById: wrap(buildById(resolvedAptitudes)),
    klassesById: wrap(buildById(resolvedKlasses)),
    racesById: wrap(buildById(resolvedRaces)),
    languagesById: wrap(buildById(resolvedLanguages)),
    itemsById: wrap(buildById(resolvedItems)),
    mechanicsById: wrap(buildById(resolvedMechanics)),
    klassLevelsById: wrap(buildById(resolvedKlassLevels)),
    klassLevelByKlassAndLevel: cowResolvingCompositeKeyMap(klassLevelByKlassAndLevel, idResolveMap),
    klassLevelsByKlassId: wrap(klassLevelsByKlassId),
    propertiesByEntity: wrap(propertiesByEntity),
    propertiesByEntityType,
    klassLevelFeatsByKlassLevel: wrap(klassLevelFeatsByKlassLevel),
    klassLevelPowersByKlassLevel: wrap(klassLevelPowersByKlassLevel),
    klassLevelFeatsWithFeatsByKlassLevel: wrap(klassLevelFeatsWithFeatsByKlassLevel),
    klassLevelPowersWithPowersByKlassLevel: wrap(klassLevelPowersWithPowersByKlassLevel),
    klassSkillsWithSkillsByKlass: wrap(klassSkillsWithSkillsByKlass),
    aptitudeIdsByHavingPowers,
    modifiersBySource: wrap(modifiersBySource),
    modifiersById,
    requirementsByEntity: wrap(requirementsByEntity),
    entityIdsByPropertyLookup,
    maxLevelByKlassId: wrap(maxLevelByKlassId),
    klassSkillsByKlassId: wrap(klassSkillsByKlassId),
    klassLevelSavesByKlassLevelId: wrap(klassLevelSavesByKlassLevelId),
    aptitudeIdBySlug,
    aptitudeIdBySpellSlug,
    featIdBySlug,
    powerIdsBySlug,
    canonicalize: (id: string) => idResolveMap.get(id) ?? id,
    cow: cowData,
  };
}

// ──────────────────────────────────────────────────────────────
// Target paths + segment labels cache (combined)
// ──────────────────────────────────────────────────────────────

const targetPathsAndLabelsCache = new MemoryCache<{ paths: TargetPath[]; segmentLabels: Record<string, string> }>();

async function getOrFetchTargetPathsAndLabels(
  rulesetId: string,
  kind: "modifier" | "requirement",
  fetcher: () => Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }>,
): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
  const cacheKey = `${rulesetId}:${kind}`;
  const cached = targetPathsAndLabelsCache.get(cacheKey);
  if (cached) return cached;

  const data = await fetcher();
  targetPathsAndLabelsCache.set(cacheKey, data);
  return data;
}

// ──────────────────────────────────────────────────────────────
// Invalidation
// ──────────────────────────────────────────────────────────────

/**
 * Invalidate only target paths + segment labels cache.
 * Call after mutations that change entity properties (weapon types, spell schools, etc.)
 * but don't affect the entity list itself.
 */
function invalidateTargetPaths(rulesetId: string): void {
  targetPathsAndLabelsCache.invalidateByPrefix(rulesetId);
}

/**
 * Invalidate COW + raw entity caches (but not target paths).
 * Call after mutations that change entity data but don't affect
 * the set of target paths (e.g. updating an entity's description).
 */
function invalidateRulesetEntities(rulesetId: string): void {
  invalidateCowData(rulesetId);
  rulesetRawDataCache.invalidate(rulesetId);
  rulesetRawDataCache.invalidateByPrefix(`${rulesetId}:`);
}

/**
 * Invalidate all cached data for a ruleset (COW + raw entity data + target paths).
 * Call after mutations that add/remove/rename entities (feats, skills, etc.)
 * since those changes affect the available target paths.
 */
function invalidateRuleset(rulesetId: string): void {
  invalidateRulesetEntities(rulesetId);
  invalidateTargetPaths(rulesetId);
}

function invalidateAll(): void {
  invalidateAllCowData();
  rulesetRawDataCache.invalidateAll();
  targetPathsAndLabelsCache.invalidateAll();
}

/**
 * Pre-warm the raw cache with all system-owned rulesets (bases + extensions).
 * Call once at server boot so the first user doesn't pay the cold-read cost.
 */
async function warmSystemRulesetCache(): Promise<void> {
  const systemRulesets = await Rulesets.findSystemOwned(db);
  await Promise.all(systemRulesets.map((r) => getOrFetchRulesetRawData(r.id)));
}

/** Test/observability helper: whether a ruleset's raw cache entry is pinned. */
function isRulesetRawDataPinned(rulesetId: string, campaignId?: string): boolean {
  return rulesetRawDataCache.isPinned(buildRawCacheKey(rulesetId, campaignId));
}

/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     Invalidation + the boot warm-up. Mutations must call `invalidateRuleset`
 *     (or `invalidateRulesetEntities` for customization-only changes).
 *     `invalidateAll` is the nuclear option.
 *
 *   Framework accessors:
 *     `getOrBuildCowData`, `getOrFetchRulesetData` — called by
 *     `withRulesetScope`. `getOrFetchTargetPathsAndLabels` — called by
 *     `TargetPathsService`. `getOrFetchRulesetRawData`, `isRulesetRawDataPinned`
 *     — used by cache regression tests to assert raw-tier pinning behaviour.
 *     None are for generic service use — they go through `withRulesetScope`.
 * ──────────────────────────────────────────────────────────────────────────
 */
export {
  invalidateAll,
  invalidateRuleset,
  invalidateRulesetEntities,
  warmSystemRulesetCache,

  // Framework accessors.
  getOrBuildCowData,
  getOrFetchRulesetData,
  getOrFetchRulesetRawData,
  getOrFetchTargetPathsAndLabels,
  isRulesetRawDataPinned,
};
