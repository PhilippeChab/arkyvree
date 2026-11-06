/** The feat pools a class's Progression tab offers: those its features are granted through, and those it may give picks in. */

import type { RulesetView } from "@/engine/core/view/index.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import type { Aptitude, Klass } from "@/engine/rulesets/pf1/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";
import { GENERAL_FEATS_APTITUDE } from "@/vocabulary/pf1/feats.ts";

/**
 * A class's own feature pool: its id (none while the ruleset has none), its name ("Witch Class Feature"), and what a
 * feature made in it is named, its typed name at `{name}` ("{name} (Witch)").
 */
interface OwnFeaturePool {
  featureName: string;
  id: string | null;
  name: string;
}

/** A pool, by its id and its name. */
interface PoolRef {
  id: string;
  name: string;
}

/** What a class's own feature pool is named: "Witch Class Feature". */
const FEATURE_POOL_SUFFIX = "Class Feature";

/**
 * The feat pools a class (`klass`, as the view has it) is offered, by whom they belong to:
 * - a pool is a class's when its name starts with the class's ("Cleric Domain", "Fighter Bonus Feat"), the longest
 *   class name that starts it winning ("Ranger Knight Class Feature" is the Ranger Knight's);
 * - its features are granted through its own feature pool ("Witch Class Feature"), the pools its levels already grant
 *   one through, and General;
 * - its picks are given in any feat pool but a class's own feature pool, its own too ("Fighter Class Feature"), which
 *   holds the features its levels grant outright, none a pick may choose: its own pools first (Cleric Domain), then
 *   the others by name (Fighter Bonus Feat, General).
 * Feat pools are the aptitudes feats are listed in: a class's spell list is none.
 */
export default class ClassOffers {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
  ) {}

  /** The ruleset's feat pools, by name. */
  private get featPools(): Aptitude[] {
    const { aptitudeIdsWithFeats, aptitudesById } = this.pf1;
    return [...aptitudeIdsWithFeats]
      .flatMap((id) => aptitudesById.get(id) ?? [])
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * The pools the class's features are granted through (`pools`, the ruleset's feat pools): its own feature pool
   * (`own`), those its levels grant one through now, and General.
   */
  private featurePoolsOf(pools: readonly Aptitude[], own: OwnFeaturePool): Aptitude[] {
    const through = this.grantedThrough();
    const general = this.pf1.aptitudeIdBySlug.get(stripSeparators(GENERAL_FEATS_APTITUDE));
    return pools.filter((pool) => pool.id === own.id || through.has(pool.id) || pool.id === general);
  }

  /** The pools the class's levels grant features through, as they grant them now. */
  private grantedThrough(): Set<string> {
    const { pf1 } = this;
    const levels = pf1.classLevelsByClass.get(this.klass.id) ?? [];
    return new Set(levels.flatMap((level) => pf1.grantedFeatsOf(level.id).flatMap(({ viaId }) => viaId ?? [])));
  }

  /** Whether a pool is a class's own feature pool ("Fighter Class Feature", by its slug), its class named as it is. */
  private isFeaturePool(pool: Aptitude, owner: Klass | undefined): boolean {
    return !!owner && stripSeparators(pool.name) === stripSeparators(`${owner.name} ${FEATURE_POOL_SUFFIX}`);
  }

  /** The class each pool (`pools`) is named after: the one with the longest name that starts it, followed by a space. */
  private ownersOf(pools: readonly Aptitude[]): Map<string, Klass | undefined> {
    const classes = this.pf1.classes.toSorted((a, b) => b.name.length - a.name.length);
    return new Map(pools.map((pool) => [pool.id, classes.find((klass) => pool.name.startsWith(`${klass.name} `))]));
  }

  /** The view's Pathfinder lists and indices. */
  private get pf1(): Pf1View {
    return Pf1View.of(this.view.rulesetData);
  }

  /**
   * The pools the class is offered: those its features are granted through (`featurePools`, its own first), those it
   * may give picks in (`pools`, its own first), and its own feature pool (`ownFeaturePool`: "Witch Class Feature", its
   * id none while the ruleset has no feat pool of its name, which its first created feature makes).
   */
  describe(): { featurePools: PoolRef[]; ownFeaturePool: OwnFeaturePool; pools: PoolRef[] } {
    const pools = this.featPools;
    const own = this.describeOwnFeaturePool();
    const featurePools = this.featurePoolsOf(pools, own);
    const owners = this.ownersOf(pools);
    // A class's own feature pool holds the features its levels grant outright: its picks are any other pool's
    const isOwn = (pool: Aptitude) => owners.get(pool.id)?.id === this.klass.id;
    const offered = pools
      .filter((pool) => !this.isFeaturePool(pool, owners.get(pool.id)))
      .toSorted((a, b) => Number(isOwn(b)) - Number(isOwn(a)));
    const ref = ({ id, name }: Aptitude) => ({ id, name });
    return {
      featurePools: featurePools.toSorted((a, b) => Number(b.id === own.id) - Number(a.id === own.id)).map(ref),
      ownFeaturePool: own,
      pools: offered.map(ref),
    };
  }

  /**
   * The feats the class's features may be granted as (`ids`), those listed in the pools its features are granted
   * through, each with those pools (`through`, its own feature pool first), and its own features (`ownIds`, its own
   * feature pool's), which its picker lists first.
   */
  describeFeatures(): { ids: string[]; ownIds: string[]; through: Map<string, PoolRef[]> } {
    const own = this.describeOwnFeaturePool();
    const pools = this.featurePoolsOf(this.featPools, own).toSorted(
      (a, b) => Number(b.id === own.id) - Number(a.id === own.id),
    );
    const through = new Map<string, PoolRef[]>();
    for (const pool of pools) {
      for (const id of this.pf1.listFeatIds(pool.id))
        through.set(id, [...(through.get(id) ?? []), { id: pool.id, name: pool.name }]);
    }
    // Its own by name, as the others come
    const ownIds = (own.id === null ? [] : this.pf1.listFeatIds(own.id))
      .flatMap((id) => this.pf1.featsById.get(id) ?? [])
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((feat) => feat.id);
    return { ids: [...through.keys()], ownIds, through };
  }

  /**
   * The feature a name creates (`given`, as typed): the name its rules give it, "Hex" and "Hex (Witch)" alike making
   * "Hex (Witch)", one space between its words, and whether the ruleset has a feat of that name already, whatever its
   * case (`exists`), which its create refuses.
   */
  describeNewFeature(given: string): { exists: boolean; name: string } {
    const { featureName } = this.describeOwnFeaturePool();
    // One space between words, and its class's name ending it however it's cased; a function replaces, so a typed "$&"
    // stays as typed
    const typed = given.replace(/\s+/g, " ");
    const suffix = featureName.replace("{name}", "").toLowerCase();
    const name = typed.toLowerCase().endsWith(suffix) ? typed : featureName.replace("{name}", () => typed);
    // A name is the ruleset's whatever its case: "aura (cleric)" is Aura (Cleric)
    const lower = name.toLowerCase();
    return { exists: this.pf1.feats.some((feat) => feat.name.toLowerCase() === lower), name };
  }

  /**
   * The class's own feature pool ("Witch Class Feature"): the aptitude of its name, its id none while the ruleset has
   * none, and what a feature made in it is named ("{name} (Witch)").
   */
  describeOwnFeaturePool(): OwnFeaturePool {
    const name = `${this.klass.name} ${FEATURE_POOL_SUFFIX}`;
    // By its slug, as a spell list's own is found: "Witch class feature" is the Witch's too
    const id = this.pf1.aptitudeIdBySlug.get(stripSeparators(name));
    return { featureName: `{name} (${this.klass.name})`, id: id ?? null, name };
  }
}
