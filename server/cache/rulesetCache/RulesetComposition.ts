import type { CowData } from "@/server/database/index.ts";
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

import { type RulesetRawData } from "./rawData.ts";
import { buildById, buildCustomizationIndices, buildKlassIndices, buildSlugIndices } from "./rulesetIndices.ts";
import { mergeSiblingRequirements } from "./siblingRequirements.ts";

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

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, the ruleset's first), composed by its copy-on-write
 * data. The copies' and siblings' exclusions apply, a sibling loser's customizations merge into its winner's, references
 * resolve to the winners, and every id-keyed map takes a stored id. Built on every read (`RulesetCache.getData`).
 */
export default class RulesetComposition {
  constructor(chain: RulesetRawData[], cow: CowData) {
    this.chain = chain;
    this.cow = cow;
  }

  private readonly chain: RulesetRawData[];

  private readonly cow: CowData;

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
  private resolveAptitudeLinks(
    feats: FeatWithAptitudes[],
    powers: PowerWithAptitudes[],
    aptitudes: Aptitude[],
    links: ReturnType<RulesetComposition["collectSiblingAptitudeLinks"]>,
  ) {
    const aptitudesByIdMap = new Map(aptitudes.map((apt) => [apt.id, apt]));

    for (const feat of feats) {
      const sibLinks = links.feats.get(feat.id);
      const source = sibLinks ? [...feat.featsAptitudesInRules, ...sibLinks] : feat.featsAptitudesInRules;
      const seen = new Set<string>();
      const rewritten: typeof feat.featsAptitudesInRules = [];
      for (const link of source) {
        const resolvedAptId = this.cow.resolve(link.aptitudeId);
        if (seen.has(resolvedAptId)) continue;
        seen.add(resolvedAptId);
        const resolvedFeatId = this.cow.resolve(link.featId);
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
        const resolvedAptId = this.cow.resolve(link.aptitudeId);
        if (seen.has(resolvedAptId)) continue;
        seen.add(resolvedAptId);
        const resolvedPowerId = this.cow.resolve(link.powerId);
        const aptitudesInRule = aptitudesByIdMap.get(resolvedAptId) ?? link.aptitudesInRule;
        rewritten.push({ ...link, aptitudeId: resolvedAptId, powerId: resolvedPowerId, aptitudesInRule });
      }
      power.powersAptitudesInRules = rewritten;
    }
  }

  /**
   * Collect sibling aptitude links (keyed by winner id, featId/powerId already remapped to winner) so they can be merged
   * into the winner's inline aptitudes-in-rule array alongside the FK remap pass. Built once from the raw chain because
   * compose filters out sibling entities before this point.
   */
  private collectSiblingAptitudeLinks() {
    const feats = new Map<string, FeatWithAptitudes["featsAptitudesInRules"]>();
    const powers = new Map<string, PowerWithAptitudes["powersAptitudesInRules"]>();
    if (this.cow.siblingIds.size === 0) return { feats, powers };
    for (const raw of this.chain) {
      for (const f of raw.feats) {
        if (this.cow.isOverridden(f.id)) continue;
        const w = this.cow.getWinner(f.id);
        if (!w) continue;
        const remapped = f.featsAptitudesInRules.map((l) => ({ ...l, featId: w }));
        const g = feats.get(w);
        if (g) g.push(...remapped);
        else feats.set(w, remapped);
      }
      for (const p of raw.powers) {
        if (this.cow.isOverridden(p.id)) continue;
        const w = this.cow.getWinner(p.id);
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
   * The class rows. Klass levels: a COW'd klass's levels are overridden by its copy's (paired by
   * `CowDataBuilder`), so the hidden check covers both entity-level and klass-level IDs uniformly. Additionally drop
   * levels whose parent klass is a sibling loser — siblingIds only has klass IDs, not klass-level IDs. The klass
   * sub-tables follow their parent klass level's visibility; klassSkills belongs to klasses directly, so it follows
   * the visible klass IDs.
   */
  private composeKlassRows(klasses: Klass[]) {
    const visibleKlassIds = new Set(klasses.map((k) => k.id));
    const klassLevels = this.composeRows((r) => r.klassLevels).filter((kl) => visibleKlassIds.has(kl.klassId));
    const visibleKlassLevelIds = new Set(klassLevels.map((kl) => kl.id));
    const ofVisibleLevels = <T extends { klassLevelId: string }>(pick: (raw: RulesetRawData) => T[]): T[] =>
      this.chain.flatMap((raw) => pick(raw).filter((row) => visibleKlassLevelIds.has(row.klassLevelId)));
    return {
      klassLevels,
      visibleKlassLevelIds,
      klassSkills: this.chain.flatMap((raw) => raw.klassSkills.filter((ks) => visibleKlassIds.has(ks.klassId))),
      klassLevelFeats: ofVisibleLevels((r) => r.klassLevelFeats),
      klassLevelPowers: ofVisibleLevels((r) => r.klassLevelPowers),
      klassLevelSaves: ofVisibleLevels((r) => r.klassLevelSaves),
    };
  }

  /** Leveled aptitude IDs: union across visible aptitudes. */
  private composeLeveledAptitudeIds(): Set<string> {
    const leveledAptitudeIds = new Set<string>();
    for (const raw of this.chain) {
      for (const id of raw.leveledAptitudeIds) {
        if (!this.cow.isHidden(id)) leveledAptitudeIds.add(id);
      }
    }
    return leveledAptitudeIds;
  }

  /** The composed rows, before the lookup indices: each list across the chain, COW-resolved. */
  private composeLists() {
    // A row is left out when a copy overrides it or it's a sibling loser. A loser's customizations merge into its winner
    // (the customization steps below skip only the overridden ones), and every stored id resolves to the winner.
    const rowsOf = <T extends { id: string } & Record<string, unknown>>(pick: (raw: RulesetRawData) => T[]) =>
      this.cow.resolveRows(this.composeRows(pick));

    const klasses = this.composeRows((r) => r.klasses);
    const klassRows = this.composeKlassRows(klasses);
    const { visibleKlassLevelIds } = klassRows;
    const { modifiers, excludedModifierIds } = this.composeModifiers(visibleKlassLevelIds);
    const composed = {
      abilities: rowsOf((r) => r.abilities),
      saves: rowsOf((r) => r.saves),
      skills: rowsOf((r) => r.skills),
      feats: rowsOf((r) => r.feats),
      powers: rowsOf((r) => r.powers),
      aptitudes: rowsOf((r) => r.aptitudes),
      klasses: this.cow.resolveRows(klasses),
      races: rowsOf((r) => r.races),
      languages: rowsOf((r) => r.languages),
      items: rowsOf((r) => r.items),
      mechanics: rowsOf((r) => r.mechanics),
      klassLevels: this.cow.resolveRows(klassRows.klassLevels),
      klassSkills: this.cow.resolveRows(klassRows.klassSkills),
      klassLevelFeats: this.cow.resolveRows(klassRows.klassLevelFeats),
      klassLevelPowers: this.cow.resolveRows(klassRows.klassLevelPowers),
      klassLevelSaves: this.cow.resolveRows(klassRows.klassLevelSaves),
      leveledAptitudeIds: this.composeLeveledAptitudeIds(),
      properties: this.composeProperties(visibleKlassLevelIds),
      modifiers,
      requirements: this.composeRequirements(visibleKlassLevelIds, excludedModifierIds),
    };
    const links = this.collectSiblingAptitudeLinks();
    if (!this.cow.isEmpty()) {
      this.resolveAptitudeLinks(composed.feats, composed.powers, composed.aptitudes, links);
    }
    return composed;
  }

  /**
   * Modifiers: drop when the source was COW'd. Sibling-sourced modifiers are merged into the winner's bucket with
   * sourceId remapped, deduped by target|value|operator|valueType. Sibling mods that dedup-skip have their ids recorded
   * in excludedModifierIds so their requirements drop too.
   */
  private composeModifiers(visibleKlassLevelIds: Set<string>) {
    const modifiers: Modifier[] = [];
    const excludedModifierIds = new Set<string>();
    const modDedupByWinner = new Map<string, Set<string>>();
    for (const raw of this.chain) {
      for (const m of raw.modifiers) {
        if (this.cow.isOverridden(m.sourceId)) {
          excludedModifierIds.add(m.id);
          continue;
        }
        if (m.sourceType === "klass_levels" && !visibleKlassLevelIds.has(m.sourceId)) {
          excludedModifierIds.add(m.id);
          continue;
        }
        const winnerId = this.cow.getWinner(m.sourceId);
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
          if (this.cow.hasSiblings(m.sourceId)) {
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
  private composeProperties(visibleKlassLevelIds: Set<string>): Property[] {
    const properties: Property[] = [];
    const propDedupByWinner = new Map<string, Set<string>>();
    for (const raw of this.chain) {
      for (const prop of raw.properties) {
        if (this.cow.isOverridden(prop.entityId)) continue;
        if (prop.entityType === "klass_levels" && !visibleKlassLevelIds.has(prop.entityId)) continue;
        const winnerId = this.cow.getWinner(prop.entityId);
        if (winnerId) {
          const key = `${prop.type}|${prop.value}`;
          const seen = propDedupByWinner.get(winnerId) ?? new Set<string>();
          if (seen.has(key)) continue;
          seen.add(key);
          propDedupByWinner.set(winnerId, seen);
          properties.push({ ...prop, entityId: winnerId });
        } else {
          properties.push(prop);
          if (this.cow.hasSiblings(prop.entityId)) {
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
  private composeRequirements(visibleKlassLevelIds: Set<string>, excludedModifierIds: Set<string>): Requirement[] {
    const requirements: Requirement[] = [];
    // Group winner-side rows by winnerId so we can build forests per entity.
    const winnerOwnReqs = new Map<string, Requirement[]>();
    // Group sibling rows by (winner, sibling source entity) to preserve each sibling's tree identity during the merge.
    const siblingReqsByWinner = new Map<string, Map<string, Requirement[]>>();

    for (const raw of this.chain) {
      for (const r of raw.requirements) {
        if (r.entityType === "modifiers") {
          if (!excludedModifierIds.has(r.entityId)) requirements.push(r);
          continue;
        }
        if (this.cow.isOverridden(r.entityId)) continue;
        if (r.entityType === "klass_levels" && !visibleKlassLevelIds.has(r.entityId)) continue;
        const winnerId = this.cow.getWinner(r.entityId);
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
  private composeRows<T extends { id: string }>(pick: (raw: RulesetRawData) => T[]): T[] {
    return this.chain.flatMap((raw) => pick(raw).filter((item) => !this.cow.isHidden(item.id)));
  }

  /**
   * Wraps a string-keyed Map so `.get(key)` and `.has(key)` look the key up as `resolveKey` maps it: consumers can pass
   * either a pre-COW (stored) id or a post-COW id — both land on the post-COW entity. `.size`, `.values()`, `.entries()`,
   * etc. behave normally (no alias duplication). Returns the original Map when the scope resolves no id (no allocation
   * cost).
   */
  private resolving<V>(map: Map<string, V>, resolveKey: (key: string) => string): Map<string, V> {
    if (this.cow.isEmpty()) return map;
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
   * A Map keyed by `${id}:${rest}` composites (e.g. `klassLevelByKlassAndLevel`'s `${klassId}:${level}` keys): the id
   * portion before the first `:` resolves through `CowData.resolve`, the rest stays. So a caller passing a pre-COW
   * klassId still lands on the right klass level.
   */
  private resolvingCompositeKeys<V>(map: Map<string, V>): Map<string, V> {
    return this.resolving(map, (key) => {
      const sep = key.indexOf(":");
      if (sep === -1) return key;
      return this.cow.resolve(key.slice(0, sep)) + key.slice(sep);
    });
  }

  /** A Map keyed by entity ids, whose `.get` and `.has` take a stored (pre-COW) id. */
  private resolvingIds<V>(map: Map<string, V>): Map<string, V> {
    return this.resolving(map, (key) => this.cow.resolve(key));
  }

  build(): CachedRulesetData {
    const { properties, modifiers, requirements, ...rows } = this.composeLists();
    const featsById = buildById(rows.feats);
    const powersById = buildById(rows.powers);
    const skillsById = buildById(rows.skills);
    const klass = buildKlassIndices(rows, featsById, powersById, skillsById);
    const customizations = buildCustomizationIndices(properties, modifiers, requirements);

    // Wrap every id-keyed Map so `.get(storedId)` / `.has(storedId)` auto-resolve pre-COW ids to the post-COW entity.
    // Consumers don't need to thread cowData through or remember to call canonicalize for the common lookup path.
    // Composite-key Maps (e.g. klassLevelByKlassAndLevel) resolve the id portion before the first `:`.
    return {
      ...rows,
      abilitiesById: this.resolvingIds(buildById(rows.abilities)),
      savesById: this.resolvingIds(buildById(rows.saves)),
      skillsById: this.resolvingIds(skillsById),
      featsById: this.resolvingIds(featsById),
      powersById: this.resolvingIds(powersById),
      aptitudesById: this.resolvingIds(buildById(rows.aptitudes)),
      klassesById: this.resolvingIds(buildById(rows.klasses)),
      racesById: this.resolvingIds(buildById(rows.races)),
      languagesById: this.resolvingIds(buildById(rows.languages)),
      itemsById: this.resolvingIds(buildById(rows.items)),
      mechanicsById: this.resolvingIds(buildById(rows.mechanics)),
      klassLevelsById: this.resolvingIds(buildById(rows.klassLevels)),
      klassLevelByKlassAndLevel: this.resolvingCompositeKeys(klass.klassLevelByKlassAndLevel),
      klassLevelsByKlassId: this.resolvingIds(klass.klassLevelsByKlassId),
      propertiesByEntity: this.resolvingIds(customizations.propertiesByEntity),
      propertiesByEntityType: customizations.propertiesByEntityType,
      klassLevelFeatsByKlassLevel: this.resolvingIds(klass.klassLevelFeatsByKlassLevel),
      klassLevelPowersByKlassLevel: this.resolvingIds(klass.klassLevelPowersByKlassLevel),
      klassLevelFeatsWithFeatsByKlassLevel: this.resolvingIds(klass.klassLevelFeatsWithFeatsByKlassLevel),
      klassLevelPowersWithPowersByKlassLevel: this.resolvingIds(klass.klassLevelPowersWithPowersByKlassLevel),
      klassSkillsWithSkillsByKlass: this.resolvingIds(klass.klassSkillsWithSkillsByKlass),
      modifiersBySource: this.resolvingIds(customizations.modifiersBySource),
      modifiersById: customizations.modifiersById,
      requirementsByEntity: this.resolvingIds(customizations.requirementsByEntity),
      entityIdsByPropertyLookup: customizations.entityIdsByPropertyLookup,
      maxLevelByKlassId: this.resolvingIds(klass.maxLevelByKlassId),
      klassSkillsByKlassId: this.resolvingIds(klass.klassSkillsByKlassId),
      klassLevelSavesByKlassLevelId: this.resolvingIds(klass.klassLevelSavesByKlassLevelId),
      ...buildSlugIndices(rows.aptitudes, rows.feats, rows.powers),
      canonicalize: (id: string) => this.cow.resolve(id),
      cow: this.cow,
    };
  }
}
