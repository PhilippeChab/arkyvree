import type { BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { GrantText } from "@/database/packages/dnd35-from-parser/tools/seeds/GrantText.ts";
import { stripClassSuffix } from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import {
  type AptitudePick,
  type BonusFeatList,
  type ClassReference,
} from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * A class's aptitude picks split per level, the first level each aptitude gets one, and how the split retargets them.
 */
export type ClassAptitudePicks = ReturnType<typeof expandAptitudePicks>;

/** A class feature, as the class's mapping holds it. */
export type MappedFeature = ClassReference["mapping"]["features"][string];

export type PerLevelExpansion = { levels: number[]; newTarget: string; ordinal: string };

/**
 * Build maps for aptitude target remapping after per-level expansion.
 * - remap: 1-to-1 remaps (single-occurrence features like Ranger combat style tiers)
 * - perLevel: 1-to-N splits (multi-occurrence features like Monk Bonus Feat)
 */
function buildAptitudeExpansionMaps(
  preMerged: AptitudePick[] | undefined,
  expanded: AptitudePick[] | undefined,
): { perLevel: Map<string, PerLevelExpansion[]>; remap: Map<string, string> } {
  const remap = new Map<string, string>();
  const perLevel = new Map<string, PerLevelExpansion[]>();
  if (!preMerged || !expanded) return { remap, perLevel };

  const expandedTargets = new Set(expanded.map((p) => p.target));
  for (const old of preMerged) {
    if (expandedTargets.has(old.target)) continue;
    const replacements = expanded.filter((p) => p.levels.some((l) => old.levels.includes(l)));
    if (replacements.length === 0) continue;
    if (replacements.length === 1) {
      remap.set(old.target, replacements[0].target);
    } else {
      const oldSlug = old.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1] ?? "";
      const entries = replacements.map((r) => {
        const newSlug = r.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1] ?? "";
        const ordinal = newSlug.slice(oldSlug.length);
        return { newTarget: r.target, levels: r.levels, ordinal };
      });
      perLevel.set(old.target, entries);
    }
  }
  return { remap, perLevel };
}

/**
 * A class's aptitude picks (`picks`, its mapping's: detected, with the overrides'), split per level where a bonus feat
 * list has one per level (`aptitudePicks`); the first level each aptitude gets a pick (`aptitudeMinLevel`, by slug);
 * and how the split retargets the merged picks (`remap` one to one, `perLevel` one to several).
 */
function expandAptitudePicks(picks: AptitudePick[] | undefined, bonusFeatLists: BonusFeatList[] | undefined) {
  const aptitudePicks = expandPerLevelAptitudePicks(picks, bonusFeatLists);
  const aptitudeMinLevel = new Map<string, number>();
  for (const pick of aptitudePicks ?? []) {
    const slug = pick.target.match(/^aptitudes\.(.+)\.allowed$/)?.[1];
    if (slug) aptitudeMinLevel.set(slug, Math.min(...pick.levels));
  }
  return { aptitudePicks, aptitudeMinLevel, ...buildAptitudeExpansionMaps(picks, aptitudePicks) };
}

/** When bonusFeatLists has per-level entries, expand the single aptitude pick into per-level picks. */
function expandPerLevelAptitudePicks(
  picks?: AptitudePick[],
  bonusFeatLists?: BonusFeatList[],
): AptitudePick[] | undefined {
  if (!picks || !bonusFeatLists) return picks;
  const perLevelLists = bonusFeatLists.filter((l) => l.levels);
  if (perLevelLists.length === 0) return picks;

  // Build a set of levels covered by per-level lists
  const perLevelCoveredLevels = new Set(perLevelLists.flatMap((l) => l.levels!));

  const result: AptitudePick[] = [];
  for (const pick of picks) {
    // Check if this pick's levels overlap with per-level bonusFeatLists
    const overlapping = pick.levels.filter((l) => perLevelCoveredLevels.has(l));
    if (overlapping.length === 0) {
      result.push(pick);
      continue;
    }

    // Replace with per-level picks for covered levels
    for (const list of perLevelLists) {
      if (!list.levels!.some((l) => overlapping.includes(l))) continue;
      const aptSlug = stripSeparators(list.aptitude);
      result.push({ levels: list.levels!, target: `aptitudes.${aptSlug}.allowed` });
    }
    // Keep any remaining levels that aren't covered by per-level lists
    const remaining = pick.levels.filter((l) => !perLevelCoveredLevels.has(l));
    if (remaining.length > 0) result.push({ levels: remaining, target: pick.target });
  }

  return result;
}

/**
 * A class's seeds' core, which its concerns (`concerns/`) build on: its reference, its book's seeds (the feats the book
 * has, the families and the domains it can name), and what its seed and its feats decide alike, once: its aptitude
 * picks split per level, the feat a feature is, and the existing feat a feature grants instead.
 */
export class BaseClassSeeds {
  constructor(ref: ClassReference, book: BaseBookSeeds) {
    this.ref = ref;
    this.book = book;
    this.classSlug = stripSeparators(ref.raw.name);
  }

  /** The existing feat each feature grants, by its name and description. */
  private readonly existingFeats = new Map<string, string | undefined>();
  /** Its book's seeds. */
  readonly book: BaseBookSeeds;
  /** The class's slug, as its paths name it (`classes.wujen.level`). */
  readonly classSlug: string;
  /** The class's reference. */
  readonly ref: ClassReference;
  /** Its aptitude picks, once split. */
  private split?: ClassAptitudePicks;

  /** Having `level` levels in the class. */
  protected classLevelRequirement(level: number): RequirementEntry[] {
    return [gte(`classes.${this.classSlug}.level`, level)];
  }

  /**
   * The existing feat a feature named `name` grants instead of being a feat of its own, of those its book has: that
   * feat (with or without the class's suffix), or one its description says it gains as a bonus feat.
   */
  protected existingFeatGranted(name: string, description: string | undefined): string | undefined {
    const key = `${name}\n${description ?? ""}`;
    if (!this.existingFeats.has(key)) {
      const baseName = stripClassSuffix(name, this.ref.raw.name);
      const { book } = this;
      this.existingFeats.set(
        key,
        (baseName && book.findExistingFeat(baseName)) ||
          book.findExistingFeat(name) ||
          (description
            ? new GrantText(name, description)
                .grantedFeatNames()
                .map((n) => book.findExistingFeat(n))
                .find(Boolean)
            : undefined),
      );
    }
    return this.existingFeats.get(key);
  }

  /** The feat a feature is, by its mapping's key: its seed name, else its key, with its aptitude when it has one. */
  protected featName(key: string, feature: MappedFeature): string {
    return feature.seedName ?? (feature.aptitude ? `${key} (${feature.aptitude})` : key);
  }

  /** The class's aptitude picks, its mapping's split per level (`expandAptitudePicks`). */
  protected picks(): ClassAptitudePicks {
    this.split ??= expandAptitudePicks(this.ref.mapping.aptitudePicks, this.ref.mapping.bonusFeatLists);
    return this.split;
  }
}
