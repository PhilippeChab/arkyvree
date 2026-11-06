import type { TieredFeats } from "@/codegen/pf1/tools/terms/classes.ts";

import type { ClassFeature } from "./ClassFeatures.ts";
import { splitList } from "./lists.ts";

/** A tier of a pool: the level it opens at, and its feats, those of the tiers before it among them. */
export interface BonusFeatTier {
  feats: string[];
  level: number;
}

/**
 * The feats a feature's text lists at each level ("These feats must be taken from the following list: Catch
 * Off-Guard, Combat Reflexes… At 6th level, the following feats are added to the list: …"): its first list at its
 * first level.
 */
function listedTiers(feature: ClassFeature): TieredFeats {
  const tiers: TieredFeats = {};
  const first = /following list: ([^.]+)\./.exec(feature.text)?.[1];
  if (first) tiers[feature.levels[0]] = splitList(first);
  for (const [, level, list] of feature.text.matchAll(
    /At (\d+)(?:st|nd|rd|th) level, the following feats are added to the list: ([^.]+)\./g,
  ))
    tiers[parseInt(level, 10)] = splitList(list);
  return tiers;
}

/** An ordinal as a pool's name writes it: 1 → "1st", 6 → "6th". */
function toOrdinal(level: number): string {
  const suffix = level % 100 >= 11 && level % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][level % 10] ?? "th");
  return `${level}${suffix}`;
}

/**
 * A bonus feat feature's pool that names its feats and grows with its levels (a monk's, a ranger's combat style's),
 * read into tiers, each a pool of its own named after the level it opens at ("Monk Bonus Feat (6th)"), holding its
 * feats and those of the tiers before it. Each of the feature's levels picks in the last tier open at it.
 */
export class BonusFeatTiers {
  constructor(
    readonly feature: ClassFeature,
    readonly aptitude: string,
    feats: TieredFeats = listedTiers(feature),
  ) {
    const levels = Object.keys(feats)
      .map(Number)
      .toSorted((a, b) => a - b);
    this.tiers = levels.map((level, i) => ({
      level,
      feats: levels.slice(0, i + 1).flatMap((open) => feats[open]),
    }));
  }

  /** Its tiers, by the level they open at. */
  readonly tiers: BonusFeatTier[];

  /** The pool a tier is: "Monk Bonus Feat (6th)". */
  aptitudeOf(tier: BonusFeatTier): string {
    return `${this.aptitude} (${toOrdinal(tier.level)})`;
  }

  /** The feature's feat a tier's picks are made by: "Bonus Feat 6th (Monk)". */
  featureOf(tier: BonusFeatTier, className: string): string {
    return `${this.feature.name} ${toOrdinal(tier.level)} (${className})`;
  }

  /** The tier the feature's pick at `level` is made in: the last open at it. */
  tierAt(level: number): BonusFeatTier | undefined {
    return this.tiers.findLast((tier) => tier.level <= level);
  }
}
