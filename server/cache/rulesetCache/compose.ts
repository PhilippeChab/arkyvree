import type { CowData } from "@/server/database/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
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
import { stripSeparators } from "@/shared/text.ts";

import { type RulesetRawData } from "./rawData.ts";
import { mergeSiblingRequirements } from "./siblingRequirements.ts";

type Chain = RulesetRawData[];

/** What a composed customization keeps, drops or moves to a sibling loser's winner. */
interface CustomizationScope {
  cow: CowData;
  visibleKlassLevelIds: Set<string>;
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

  // O(1) lookup indices built from the arrays above
  // Consumers that used to do `Feats.findOne(db, {id})` / `Properties.findMany(db, ...)`
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
  /** Key: `${klassId}:${level}`. */
  klassLevelByKlassAndLevel: Map<string, KlassLevel>;
  /** klassId → klassLevels[] sorted by level. */
  klassLevelsByKlassId: Map<string, KlassLevel[]>;
  /** entityId → properties[]. */
  propertiesByEntity: Map<string, Property[]>;
  /** entityType → properties[] (e.g. "items" → all item properties across the chain).
   *  Covers the "group properties by entity type" pattern TargetPaths needs. */
  propertiesByEntityType: Map<string, Property[]>;
  /** klassLevelId → klassLevelFeats[]. */
  klassLevelFeatsByKlassLevel: Map<string, KlassLevelFeat[]>;
  /** klassLevelId → klassLevelPowers[]. */
  klassLevelPowersByKlassLevel: Map<string, KlassLevelPower[]>;
  /** klassLevelId → klassLevelFeats joined with their feats. */
  klassLevelFeatsWithFeatsByKlassLevel: Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]>;
  /** klassLevelId → klassLevelPowers joined with their powers. */
  klassLevelPowersWithPowersByKlassLevel: Map<string, (KlassLevelPower & { powersInRule: PowerWithAptitudes })[]>;
  /** klassId → klassSkills joined with their skills. */
  klassSkillsWithSkillsByKlass: Map<string, (KlassSkill & { skillsInRule: Skill })[]>;
  /** Aptitude IDs that have at least one power linked in powers_aptitudes. */
  aptitudeIdsByHavingPowers: Set<string>;
  /** Modifier rows indexed by sourceId. */
  modifiersBySource: Map<string, Modifier[]>;
  /** Modifier rows indexed by id. */
  modifiersById: Map<string, Modifier>;
  /** Requirement rows (non-sibling) indexed by entityId. */
  requirementsByEntity: Map<string, Requirement[]>;
  /** Reverse property index: `${entityType}:${type}:${value}` → entity IDs
   *  matching that property.
   *  Stays ruleset-agnostic — any (entityType, type, value) triple can be looked up. */
  entityIdsByPropertyLookup: Map<string, string[]>;
  /** klassId → highest `level` among that klass's klass levels (the level-up class list). */
  maxLevelByKlassId: Map<string, number>;
  /** klassId → klassSkills[] (bare rows, unjoined).
   *  Complements `klassSkillsWithSkillsByKlass` for callers that only need the link rows. */
  klassSkillsByKlassId: Map<string, KlassSkill[]>;
  /** klassLevelId → klassLevelSaves[]. */
  klassLevelSavesByKlassLevelId: Map<string, KlassLevelSave[]>;
  /** `stripSeparators(aptitude.name)` → aptitudeId. Killed off 4+ inline rebuilds
   *  of the same map across services (finalize, distribution, the pick queries, loader). */
  aptitudeIdBySlug: Map<string, string>;
  /** `toSpellPossessionSlug(aptitude.name)` → aptitudeId. Used by the "set powers.X.<apt>.known"
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
  cow: CowData;
}

function buildById<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/** Leveled aptitude IDs: union across visible aptitudes. */
function composeLeveledAptitudeIds(chain: Chain, isExcluded: (id: string) => boolean): Set<string> {
  const leveledAptitudeIds = new Set<string>();
  for (const raw of chain) {
    for (const id of raw.leveledAptitudeIds) {
      if (!isExcluded(id)) leveledAptitudeIds.add(id);
    }
  }
  return leveledAptitudeIds;
}

/**
 * Modifiers: drop when the source was COW'd. Sibling-sourced modifiers are merged into the winner's bucket with
 * sourceId remapped, deduped by target|value|operator|valueType. Sibling mods that dedup-skip have their ids recorded
 * in excludedModifierIds so their requirements drop too.
 */
function composeModifiers(chain: Chain, scope: CustomizationScope) {
  const { cow, visibleKlassLevelIds } = scope;
  const modifiers: Modifier[] = [];
  const excludedModifierIds = new Set<string>();
  const modDedupByWinner = new Map<string, Set<string>>();
  for (const raw of chain) {
    for (const m of raw.modifiers) {
      if (cow.isOverridden(m.sourceId)) {
        excludedModifierIds.add(m.id);
        continue;
      }
      if (m.sourceType === "klass_levels" && !visibleKlassLevelIds.has(m.sourceId)) {
        excludedModifierIds.add(m.id);
        continue;
      }
      const winnerId = cow.getWinner(m.sourceId);
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
        if (cow.hasSiblings(m.sourceId)) {
          const seen = modDedupByWinner.get(m.sourceId) ?? new Set<string>();
          seen.add(`${m.target}|${m.value}|${m.operator}|${m.valueType}`);
          modDedupByWinner.set(m.sourceId, seen);
        }
      }
    }
  }
  return { modifiers, excludedModifierIds };
}

/**
 * Properties: concat, remap sibling props to winner entityId, dedup (type|value) within each winner group.
 * Ruleset-level properties (entityId === rulesetId) are never excluded because a ruleset's ID is never overridden. Also
 * drop klass-level properties whose parent klass is a sibling loser — those klass levels have already been filtered
 * out of `klassLevels`, so their props would be orphans in `propertiesByEntity`.
 */
function composeProperties(chain: Chain, scope: CustomizationScope): Property[] {
  const { cow, visibleKlassLevelIds } = scope;
  const properties: Property[] = [];
  const propDedupByWinner = new Map<string, Set<string>>();
  for (const raw of chain) {
    for (const prop of raw.properties) {
      if (cow.isOverridden(prop.entityId)) continue;
      if (prop.entityType === "klass_levels" && !visibleKlassLevelIds.has(prop.entityId)) continue;
      const winnerId = cow.getWinner(prop.entityId);
      if (winnerId) {
        const key = `${prop.type}|${prop.value}`;
        const seen = propDedupByWinner.get(winnerId) ?? new Set<string>();
        if (seen.has(key)) continue;
        seen.add(key);
        propDedupByWinner.set(winnerId, seen);
        properties.push({ ...prop, entityId: winnerId });
      } else {
        properties.push(prop);
        if (cow.hasSiblings(prop.entityId)) {
          const seen = propDedupByWinner.get(prop.entityId) ?? new Set<string>();
          seen.add(`${prop.type}|${prop.value}`);
          propDedupByWinner.set(prop.entityId, seen);
        }
      }
    }
  }
  return properties;
}

/**
 * Requirements: entityType='modifiers' rows survive when their modifier wasn't excluded (keyed by modifier.id).
 * Entity-level rows go through the same recursive forest merge that mergeSiblingData uses at write time:
 *   - Build the winner's forest from its own reqs
 *   - For each sibling, build its forest, dedup leaves against existing conditions on the winner, and append each
 *     tree at a fresh top-level position with renumbered child paths.
 * The result is the same in-memory list shape as before.
 */
function composeRequirements(chain: Chain, scope: CustomizationScope, excludedModifierIds: Set<string>): Requirement[] {
  const { cow, visibleKlassLevelIds } = scope;
  const requirements: Requirement[] = [];
  // Group winner-side rows by winnerId so we can build forests per entity.
  const winnerOwnReqs = new Map<string, Requirement[]>();
  // Group sibling rows by (winner, sibling source entity) to preserve each sibling's tree identity during the merge.
  const siblingReqsByWinner = new Map<string, Map<string, Requirement[]>>();

  for (const raw of chain) {
    for (const r of raw.requirements) {
      if (r.entityType === "modifiers") {
        if (!excludedModifierIds.has(r.entityId)) requirements.push(r);
        continue;
      }
      if (cow.isOverridden(r.entityId)) continue;
      if (r.entityType === "klass_levels" && !visibleKlassLevelIds.has(r.entityId)) continue;
      const winnerId = cow.getWinner(r.entityId);
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

  for (const [winnerId, bySibling] of siblingReqsByWinner) {
    const winnerReqs = winnerOwnReqs.get(winnerId) ?? [];
    const entityType = bySibling.values().next().value![0].entityType;
    requirements.push(...mergeSiblingRequirements(winnerReqs, bySibling.values(), winnerId, entityType));
  }
  return requirements;
}

/** A list's rows across the chain, the fork's first, without the overridden ones and the sibling losers. */
function composeRows<T extends { id: string }>(
  chain: Chain,
  pick: (raw: RulesetRawData) => T[],
  isExcluded: (id: string) => boolean,
): T[] {
  return chain.flatMap((raw) => pick(raw).filter((item) => !isExcluded(item.id)));
}

/**
 * The class rows. Klass levels: a COW'd klass's levels are overridden by its copy's (paired by
 * `CowDataBuilder`), so isExcluded covers both entity-level and klass-level IDs uniformly. Additionally drop
 * levels whose parent klass is a sibling loser — siblingIds only has klass IDs, not klass-level IDs. The klass
 * sub-tables follow their parent klass level's visibility; klassSkills belongs to klasses directly, so it follows
 * the visible klass IDs.
 */
function composeKlassRows(chain: Chain, klasses: Klass[], isExcluded: (id: string) => boolean) {
  const visibleKlassIds = new Set(klasses.map((k) => k.id));
  const klassLevels = composeRows(chain, (r) => r.klassLevels, isExcluded).filter((kl) =>
    visibleKlassIds.has(kl.klassId),
  );
  const visibleKlassLevelIds = new Set(klassLevels.map((kl) => kl.id));
  const ofVisibleLevels = <T extends { klassLevelId: string }>(pick: (raw: RulesetRawData) => T[]): T[] =>
    chain.flatMap((raw) => pick(raw).filter((row) => visibleKlassLevelIds.has(row.klassLevelId)));
  return {
    klassLevels,
    visibleKlassLevelIds,
    klassSkills: chain.flatMap((raw) => raw.klassSkills.filter((ks) => visibleKlassIds.has(ks.klassId))),
    klassLevelFeats: ofVisibleLevels((r) => r.klassLevelFeats),
    klassLevelPowers: ofVisibleLevels((r) => r.klassLevelPowers),
    klassLevelSaves: ofVisibleLevels((r) => r.klassLevelSaves),
  };
}

/**
 * Variant of cowResolvingMap for Maps keyed by `${id}:${rest}` composites
 * (e.g. `klassLevelByKlassAndLevel`'s `${klassId}:${level}` keys). Resolves
 * the id portion before the first `:` through `CowData.resolve`, leaves the
 * rest untouched. So a caller passing a pre-COW klassId still lands on the
 * right klass level.
 */
function cowResolvingCompositeKeyMap<V>(map: Map<string, V>, cow: CowData): Map<string, V> {
  if (cow.isEmpty()) return map;
  const resolveKey = (key: string): string => {
    const sep = key.indexOf(":");
    if (sep === -1) return key;
    return cow.resolve(key.slice(0, sep)) + key.slice(sep);
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

/**
 * Wraps a string-keyed Map so `.get(key)` and `.has(key)` auto-resolve the
 * key through `CowData.resolve` before hitting the underlying Map. Consumers
 * can pass either a pre-COW (stored) id or a post-COW id — both land on
 * the post-COW entity. `.size`, `.values()`, `.entries()`, etc. behave
 * normally (no alias duplication).
 *
 * Returns the original Map when the scope resolves no id (no allocation cost).
 */
function cowResolvingMap<V>(map: Map<string, V>, cow: CowData): Map<string, V> {
  if (cow.isEmpty()) return map;
  return new Proxy(map, {
    get(target, prop) {
      if (prop === "get") {
        return (key: string) => target.get(cow.resolve(key));
      }
      if (prop === "has") {
        return (key: string) => target.has(cow.resolve(key));
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * The customization indices over the composed (non-sibling) rows: properties by entity and by entity type,
 * modifiers by source and by id, requirements by entity, and the reverse property index — replaces O(N) scans like
 * `powers.filter(p => p.properties.some(x => x.type === TYPE && x.value === V))`, keyed
 * `${entityType}:${type}:${value}`.
 */
function customizationIndices(properties: Property[], modifiers: Modifier[], requirements: Requirement[]) {
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
function klassIndices(
  rows: Pick<
    CachedRulesetData,
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
 * Collect sibling aptitude links (keyed by winner id, featId/powerId already remapped to winner) so they can be merged
 * into the winner's inline aptitudes-in-rule array alongside the FK remap pass. Built once from the raw chain because
 * compose filters out sibling entities before this point.
 */
function siblingAptitudeLinks(chain: Chain, scope: CustomizationScope) {
  const { cow } = scope;
  const feats = new Map<string, FeatWithAptitudes["featsAptitudesInRules"]>();
  const powers = new Map<string, PowerWithAptitudes["powersAptitudesInRules"]>();
  if (cow.siblingIds.size === 0) return { feats, powers };
  for (const raw of chain) {
    for (const f of raw.feats) {
      if (cow.isOverridden(f.id)) continue;
      const w = cow.getWinner(f.id);
      if (!w) continue;
      const remapped = f.featsAptitudesInRules.map((l) => ({ ...l, featId: w }));
      const g = feats.get(w);
      if (g) g.push(...remapped);
      else feats.set(w, remapped);
    }
    for (const p of raw.powers) {
      if (cow.isOverridden(p.id)) continue;
      const w = cow.getWinner(p.id);
      if (!w) continue;
      const remapped = p.powersAptitudesInRules.map((l) => ({ ...l, powerId: w }));
      const g = powers.get(w);
      if (g) g.push(...remapped);
      else powers.set(w, remapped);
    }
  }
  return { feats, powers };
}

/**
 * Resolve IDs nested inside the feat/power join arrays. `CowData.resolveRows` only touches top-level string fields; the
 * inline powersAptitudesInRules / featsAptitudesInRules arrays still hold pre-COW aptitudeIds + pre-COW Aptitude join
 * objects after a sibling-dedup or aptitude COW. Downstream consumers compare these against post-COW IDs from the
 * composed cache (`pa.aptitudeId === rulesetData.aptitudesById...`) and silently miss. Walk the arrays once here so
 * every `aptitudeId`, `powerId`, `featId`, and `aptitudesInRule` entry is post-COW. Also merge sibling aptitude links
 * here; dedup by resolved aptitudeId so sibling duplicates collapse naturally. Siblings always imply stale ids
 * (`CowDataBuilder` aliases each sibling loser to its winner), so the caller runs this only when the scope resolves an
 * id, and the shallow-copied feats and powers are safe to mutate.
 */
function resolveAptitudeLinks(
  feats: FeatWithAptitudes[],
  powers: PowerWithAptitudes[],
  aptitudes: Aptitude[],
  links: ReturnType<typeof siblingAptitudeLinks>,
  cow: CowData,
) {
  const aptitudesByIdMap = new Map(aptitudes.map((apt) => [apt.id, apt]));

  for (const feat of feats) {
    const sibLinks = links.feats.get(feat.id);
    const source = sibLinks ? [...feat.featsAptitudesInRules, ...sibLinks] : feat.featsAptitudesInRules;
    const seen = new Set<string>();
    const rewritten: typeof feat.featsAptitudesInRules = [];
    for (const link of source) {
      const resolvedAptId = cow.resolve(link.aptitudeId);
      if (seen.has(resolvedAptId)) continue;
      seen.add(resolvedAptId);
      const resolvedFeatId = cow.resolve(link.featId);
      const aptitudesInRule = aptitudesByIdMap.get(resolvedAptId) ?? link.aptitudesInRule;
      rewritten.push({ ...link, aptitudeId: resolvedAptId, featId: resolvedFeatId, aptitudesInRule });
    }
    feat.featsAptitudesInRules = rewritten;
  }

  for (const power of powers) {
    const sibLinks = links.powers.get(power.id);
    const source = sibLinks ? [...power.powersAptitudesInRules, ...sibLinks] : power.powersAptitudesInRules;
    const seen = new Set<string>();
    const rewritten: typeof power.powersAptitudesInRules = [];
    for (const link of source) {
      const resolvedAptId = cow.resolve(link.aptitudeId);
      if (seen.has(resolvedAptId)) continue;
      seen.add(resolvedAptId);
      const resolvedPowerId = cow.resolve(link.powerId);
      const aptitudesInRule = aptitudesByIdMap.get(resolvedAptId) ?? link.aptitudesInRule;
      rewritten.push({ ...link, aptitudeId: resolvedAptId, powerId: resolvedPowerId, aptitudesInRule });
    }
    power.powersAptitudesInRules = rewritten;
  }
}

/** The composed rows, before the lookup indices: each list across the chain, COW-resolved. */
function composeChain(chain: Chain, cow: CowData) {
  // A row is left out when a copy overrides it or it's a sibling loser. A loser's customizations merge into its winner
  // (the customization steps below skip only the overridden ones), and every stored id resolves to the winner.
  const isExcluded = (id: string) => cow.isHidden(id);
  const rowsOf = <T extends { id: string } & Record<string, unknown>>(pick: (raw: RulesetRawData) => T[]) =>
    cow.resolveRows(composeRows(chain, pick, isExcluded));

  const klasses = composeRows(chain, (r) => r.klasses, isExcluded);
  const klassRows = composeKlassRows(chain, klasses, isExcluded);
  const scope: CustomizationScope = { cow, visibleKlassLevelIds: klassRows.visibleKlassLevelIds };
  const { modifiers, excludedModifierIds } = composeModifiers(chain, scope);
  const composed = {
    abilities: rowsOf((r) => r.abilities),
    saves: rowsOf((r) => r.saves),
    skills: rowsOf((r) => r.skills),
    feats: rowsOf((r) => r.feats),
    powers: rowsOf((r) => r.powers),
    aptitudes: rowsOf((r) => r.aptitudes),
    klasses: cow.resolveRows(klasses),
    races: rowsOf((r) => r.races),
    languages: rowsOf((r) => r.languages),
    items: rowsOf((r) => r.items),
    mechanics: rowsOf((r) => r.mechanics),
    klassLevels: cow.resolveRows(klassRows.klassLevels),
    klassSkills: cow.resolveRows(klassRows.klassSkills),
    klassLevelFeats: cow.resolveRows(klassRows.klassLevelFeats),
    klassLevelPowers: cow.resolveRows(klassRows.klassLevelPowers),
    klassLevelSaves: cow.resolveRows(klassRows.klassLevelSaves),
    leveledAptitudeIds: composeLeveledAptitudeIds(chain, isExcluded),
    properties: composeProperties(chain, scope),
    modifiers,
    requirements: composeRequirements(chain, scope, excludedModifierIds),
  };
  const links = siblingAptitudeLinks(chain, scope);
  if (!cow.isEmpty()) {
    resolveAptitudeLinks(composed.feats, composed.powers, composed.aptitudes, links, cow);
  }
  return composed;
}

/**
 * Slug indices — used by modifier target parsing (aptitudes.<slug>.…, feats.<slug>.possessed,
 * powers.<slug>.<apt>.known) and several inline map rebuilds across services that all derive the same slug→ID
 * mapping. Also the aptitudes that have a power linked, from the powers' inline `powersAptitudesInRules` rows.
 */
function slugIndices(aptitudes: Aptitude[], feats: FeatWithAptitudes[], powers: PowerWithAptitudes[]) {
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

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, the ruleset's first), composed by copy-on-write. The
 * copies' and siblings' exclusions apply, references resolve to the winners, and every id-keyed map takes a stored id.
 */
export function buildRulesetData(chain: RulesetRawData[], cowData: CowData): CachedRulesetData {
  const { properties, modifiers, requirements, ...rows } = composeChain(chain, cowData);
  const featsById = buildById(rows.feats);
  const powersById = buildById(rows.powers);
  const skillsById = buildById(rows.skills);
  const klass = klassIndices(rows, featsById, powersById, skillsById);
  const customizations = customizationIndices(properties, modifiers, requirements);

  // Wrap every id-keyed Map so `.get(storedId)` / `.has(storedId)` auto-resolve pre-COW ids to the post-COW entity.
  // Consumers don't need to thread cowData through or remember to call canonicalize for the common lookup path.
  // Composite-key Maps (e.g. klassLevelByKlassAndLevel) use a specialized wrapper that canonicalizes the id portion
  // before the first `:`.
  const wrap = <V>(map: Map<string, V>) => cowResolvingMap(map, cowData);

  return {
    ...rows,
    abilitiesById: wrap(buildById(rows.abilities)),
    savesById: wrap(buildById(rows.saves)),
    skillsById: wrap(skillsById),
    featsById: wrap(featsById),
    powersById: wrap(powersById),
    aptitudesById: wrap(buildById(rows.aptitudes)),
    klassesById: wrap(buildById(rows.klasses)),
    racesById: wrap(buildById(rows.races)),
    languagesById: wrap(buildById(rows.languages)),
    itemsById: wrap(buildById(rows.items)),
    mechanicsById: wrap(buildById(rows.mechanics)),
    klassLevelsById: wrap(buildById(rows.klassLevels)),
    klassLevelByKlassAndLevel: cowResolvingCompositeKeyMap(klass.klassLevelByKlassAndLevel, cowData),
    klassLevelsByKlassId: wrap(klass.klassLevelsByKlassId),
    propertiesByEntity: wrap(customizations.propertiesByEntity),
    propertiesByEntityType: customizations.propertiesByEntityType,
    klassLevelFeatsByKlassLevel: wrap(klass.klassLevelFeatsByKlassLevel),
    klassLevelPowersByKlassLevel: wrap(klass.klassLevelPowersByKlassLevel),
    klassLevelFeatsWithFeatsByKlassLevel: wrap(klass.klassLevelFeatsWithFeatsByKlassLevel),
    klassLevelPowersWithPowersByKlassLevel: wrap(klass.klassLevelPowersWithPowersByKlassLevel),
    klassSkillsWithSkillsByKlass: wrap(klass.klassSkillsWithSkillsByKlass),
    modifiersBySource: wrap(customizations.modifiersBySource),
    modifiersById: customizations.modifiersById,
    requirementsByEntity: wrap(customizations.requirementsByEntity),
    entityIdsByPropertyLookup: customizations.entityIdsByPropertyLookup,
    maxLevelByKlassId: wrap(klass.maxLevelByKlassId),
    klassSkillsByKlassId: wrap(klass.klassSkillsByKlassId),
    klassLevelSavesByKlassLevelId: wrap(klass.klassLevelSavesByKlassLevelId),
    ...slugIndices(rows.aptitudes, rows.feats, rows.powers),
    canonicalize: (id: string) => cowData.resolve(id),
    cow: cowData,
  };
}
