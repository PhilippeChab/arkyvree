import type { CowData } from "@/engine/core/cow/index.ts";
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

import RulesetData, { type RulesetLists } from "./RulesetData.ts";
import {
  mergeSiblingAptitudeLinks,
  mergeSiblingModifiers,
  mergeSiblingProperties,
  mergeSiblingRequirements,
} from "./siblingMerge.ts";
import SiblingRows from "./SiblingRows.ts";

/** A ruleset's own rows, none of its sources': what the server fetches for each ruleset of a chain to compose. */
export interface RulesetRawData {
  abilities: RulesetAbility[];
  aptitudes: Aptitude[];
  feats: FeatWithAptitudes[];
  items: Item[];
  klasses: Klass[];
  klassLevelFeats: KlassLevelFeat[];
  klassLevelPowers: KlassLevelPower[];
  klassLevels: KlassLevel[];
  klassLevelSaves: KlassLevelSave[];
  klassSkills: KlassSkill[];
  languages: Language[];
  leveledAptitudeIds: Set<string>;
  mechanics: Mechanic[];
  /** Every modifier whose source is an entity in this ruleset — all sourceTypes. */
  modifiers: Modifier[];
  powers: PowerWithAptitudes[];
  /** Every property row owned by this ruleset — all entityTypes. Consumers filter. */
  properties: Property[];
  races: Race[];
  /** Every requirement row in this ruleset, including those attached to modifiers. */
  requirements: Requirement[];
  saves: RulesetSave[];
  skills: Skill[];
}

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, the ruleset's first), composed by its copy-on-write
 * data. The copies' and siblings' exclusions apply, a sibling loser's customizations merge into its winner's, references
 * resolve to the winners, and every id-keyed map takes a stored id. Built on every read (`RulesetCache.getData`).
 */
export default class RulesetComposition {
  /** `orderProperties`: the ruleset's order of an entity's properties, which its view keeps. */
  constructor(chain: RulesetRawData[], cow: CowData, orderProperties: (properties: Property[]) => Property[]) {
    this.chain = chain;
    this.cow = cow;
    this.orderProperties = orderProperties;
  }

  private readonly chain: RulesetRawData[];

  private readonly cow: CowData;

  private readonly orderProperties: (properties: Property[]) => Property[];

  /**
   * Each sibling loser's aptitude links, by the loser, on its winner (`featId` / `powerId`), for the winner's links to
   * merge: read from the raw chain, since compose leaves the losers out.
   */
  private collectSiblingAptitudeLinks() {
    const feats = new Map<string, FeatWithAptitudes["featsAptitudesInRules"]>();
    const powers = new Map<string, PowerWithAptitudes["powersAptitudesInRules"]>();
    if (this.cow.siblingIds.size === 0) return { feats, powers };
    for (const raw of this.chain) {
      for (const f of raw.feats) {
        const winnerId = this.cow.isOverridden(f.id) ? undefined : this.cow.getWinner(f.id);
        if (!winnerId) continue;
        feats.set(
          f.id,
          f.featsAptitudesInRules.map((l) => ({ ...l, featId: winnerId })),
        );
      }
      for (const p of raw.powers) {
        const winnerId = this.cow.isOverridden(p.id) ? undefined : this.cow.getWinner(p.id);
        if (!winnerId) continue;
        powers.set(
          p.id,
          p.powersAptitudesInRules.map((l) => ({ ...l, powerId: winnerId })),
        );
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
    for (const raw of this.chain)
      for (const id of raw.leveledAptitudeIds) if (!this.cow.isHidden(id)) leveledAptitudeIds.add(id);

    return leveledAptitudeIds;
  }

  /** The composed rows, before the lookup indices: each list across the chain, COW-resolved. */
  private composeLists(): RulesetLists {
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
    if (!this.cow.isEmpty()) this.resolveAptitudeLinks(composed.feats, composed.powers, composed.aptitudes, links);

    return composed;
  }

  /**
   * Modifiers, the fork's first: a copied source's and an invisible class level's are left out, and a sibling loser's
   * the merge leaves out (`mergeSiblingModifiers`); the rest of a loser's move to its winner. Every modifier left out is
   * excluded, its requirements with it.
   */
  private composeModifiers(visibleKlassLevelIds: Set<string>) {
    const siblingRows = new SiblingRows<Modifier>(this.cow);
    const excludedModifierIds = new Set<string>();
    for (const raw of this.chain) {
      for (const m of raw.modifiers) {
        const isVisible =
          !this.cow.isOverridden(m.sourceId) &&
          (m.sourceType !== "klass_levels" || visibleKlassLevelIds.has(m.sourceId));
        if (isVisible) siblingRows.add(m, m.sourceId);
        else excludedModifierIds.add(m.id);
      }
    }
    const groups = siblingRows.getGroups();
    const taken = new Set(groups.flatMap(({ own, siblings }) => mergeSiblingModifiers(own, siblings)));
    for (const m of groups.flatMap(({ siblings }) => siblings.flat())) if (!taken.has(m)) excludedModifierIds.add(m.id);

    return { modifiers: siblingRows.moveTaken(taken, (m, sourceId) => ({ ...m, sourceId })), excludedModifierIds };
  }

  /**
   * Properties, the fork's first: a copied entity's and an invisible class level's are left out (a sibling loser's
   * class levels aren't in `klassLevels`), and a sibling loser's the merge leaves out (`mergeSiblingProperties`); the
   * rest of a loser's move to its winner. A ruleset's own properties always stay: a ruleset is never overridden.
   */
  private composeProperties(visibleKlassLevelIds: Set<string>): Property[] {
    const siblingRows = new SiblingRows<Property>(this.cow);
    for (const raw of this.chain) {
      for (const p of raw.properties) {
        if (this.cow.isOverridden(p.entityId)) continue;
        if (p.entityType === "klass_levels" && !visibleKlassLevelIds.has(p.entityId)) continue;
        siblingRows.add(p, p.entityId);
      }
    }
    const taken = new Set(
      siblingRows.getGroups().flatMap(({ own, siblings }) => mergeSiblingProperties(own, siblings)),
    );
    return siblingRows.moveTaken(taken, (p, entityId) => ({ ...p, entityId }));
  }

  /**
   * Requirements, the fork's first: a modifier's stay unless the modifier was excluded. An entity's are left out with a
   * copied entity and an invisible class level; a sibling loser's merge into its winner's as trees
   * (`mergeSiblingRequirements`, which `EntityCopy` writes the same way), after the rest.
   */
  private composeRequirements(visibleKlassLevelIds: Set<string>, excludedModifierIds: Set<string>): Requirement[] {
    const siblingRows = new SiblingRows<Requirement>(this.cow);
    for (const raw of this.chain) {
      for (const r of raw.requirements) {
        const isVisible =
          r.entityType === "modifiers"
            ? !excludedModifierIds.has(r.entityId)
            : !this.cow.isOverridden(r.entityId) &&
              (r.entityType !== "klass_levels" || visibleKlassLevelIds.has(r.entityId));
        if (isVisible) siblingRows.add(r, r.entityId);
      }
    }
    return siblingRows.withMerged(
      siblingRows
        .getGroups()
        .flatMap(({ winnerId, own, siblings }) => mergeSiblingRequirements(own, siblings, winnerId)),
    );
  }

  /** A list's rows across the chain, the fork's first, without the overridden ones and the sibling losers. */
  private composeRows<T extends { id: string }>(pick: (raw: RulesetRawData) => T[]): T[] {
    return this.chain.flatMap((raw) => pick(raw).filter((item) => !this.cow.isHidden(item.id)));
  }

  /**
   * An entity's aptitude links, its siblings' merged in (`mergeSiblingAptitudeLinks`, which `EntityCopy` writes the
   * same way), each to the aptitude that stands for it. Its own links that resolve to one aptitude collapse too, the
   * first one kept.
   */
  private linkAptitudes<L extends { aptitudeId: string; aptitudesInRule: Aptitude }>(
    entityId: string,
    own: L[],
    siblingLinks: Map<string, L[]>,
    aptitudesById: Map<string, Aptitude>,
  ): L[] {
    const links = this.cow.hasSiblings(entityId)
      ? [
          ...own,
          ...mergeSiblingAptitudeLinks(
            own,
            this.cow.getSiblings(entityId).map((loserId) => siblingLinks.get(loserId) ?? []),
            (id) => this.cow.resolve(id),
          ),
        ]
      : own;
    const aptitudeIds = new Set<string>();
    const resolved: L[] = [];
    for (const link of links) {
      const aptitudeId = this.cow.resolve(link.aptitudeId);
      if (aptitudeIds.has(aptitudeId)) continue;
      aptitudeIds.add(aptitudeId);
      resolved.push({ ...link, aptitudeId, aptitudesInRule: aptitudesById.get(aptitudeId) ?? link.aptitudesInRule });
    }
    return resolved;
  }

  /**
   * Resolve the ids inside the feats' and powers' aptitude links, which `CowData.resolveRows` doesn't reach: each link's
   * aptitude, and the aptitude row on it, to the one that stands for it (after an aptitude's copy or a sibling
   * merge), so that a reader comparing it with the view's ids (`rulesetData.aptitudesById`) matches. A sibling loser's
   * links merge into its winner's here. Siblings always imply stale ids (`CowDataBuilder` aliases each sibling loser to
   * its winner), so the caller runs this only when the scope resolves an id, and the shallow-copied feats and powers
   * are safe to mutate.
   */
  private resolveAptitudeLinks(
    feats: FeatWithAptitudes[],
    powers: PowerWithAptitudes[],
    aptitudes: Aptitude[],
    links: ReturnType<RulesetComposition["collectSiblingAptitudeLinks"]>,
  ) {
    const aptitudesById = new Map(aptitudes.map((apt) => [apt.id, apt]));
    for (const feat of feats)
      feat.featsAptitudesInRules = this.linkAptitudes(feat.id, feat.featsAptitudesInRules, links.feats, aptitudesById);

    for (const power of powers) {
      power.powersAptitudesInRules = this.linkAptitudes(
        power.id,
        power.powersAptitudesInRules,
        links.powers,
        aptitudesById,
      );
    }
  }

  build(): RulesetData {
    return new RulesetData(this.composeLists(), this.cow, this.orderProperties);
  }
}
