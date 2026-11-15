import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { BonusFeatList } from "./classes.ts";
import type { NamedText } from "./reference.ts";

/**
 * A class's epic progression as the SRD's Epic Class Progressions page gives it: the class it continues past 20th
 * level, its paragraphs (each a feature's rule, `NamedText`: "Bonus Feats", "Barbarian Rage"), its bonus feat list as
 * written, and its table's Special column, by level (21st to 30th), each entry as written ("Rage 7/day").
 */
export interface EpicClassEntry {
  bonusFeatList: string;
  features: NamedText[];
  name: string;
  table: { level: number; special: string[] }[];
}

/**
 * What an epic class's levels give, as the seeds make it: its class's levels from 21st to its last, the features they
 * grant (the core class's own, each where its pattern goes on, `features`), and its bonus feats, a pool of its own
 * (`bonusFeatList`: "Epic Barbarian Bonus Feat") a class feature gives a pick in (`bonusFeats`: "Bonus Feat (Epic
 * Barbarian)", at its levels).
 */
export interface EpicClassFields {
  bonusFeatList: BonusFeatList;
  bonusFeats: EpicFeature & { description: string };
  /** The aptitude the core class's features are taken in: "Barbarian Class Feature" */
  classFeatureAptitude: string;
  features: EpicFeature[];
  /**
   * The core rules' pools whose feats its bonus feat list takes too: a fighter's "any feat designated as a fighter
   * bonus feat" (Fighter Bonus Feat)
   */
  joins?: string[];
  skip?: boolean;
}

export interface EpicClassReference {
  _meta: ScrapedMeta<"epicClass">;

  /** What each class's text and table give: its features' patterns, its bonus feats', and what it couldn't read */
  detected: Record<
    string,
    {
      bonusFeats?: Omit<EpicFeature, "feature">;
      feats: string[];
      features: EpicFeature[];
      /** An entry of its table that names no feature of its class, or a pattern its levels don't keep */
      unresolved?: string[];
    }
  >;

  /** Each class as the seeds make it: what's detected, its overrides applied */
  mapping: Record<string, EpicClassFields>;

  overrides?: Overrides<Partial<Omit<EpicClassFields, "classFeatureAptitude">>>;

  /** Every class the page continues past 20th level */
  raw: EpicClassEntry[];
}

/** A class feature an epic class's levels grant: at its first level past 20th, and every so many after. */
export interface EpicFeature {
  every: number;
  /** The feature's feat, as the core rules name it: "Rage (Barbarian)" */
  feature: string;
  first: number;
}
