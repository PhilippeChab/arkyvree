import { readGrantedFeatNames } from "@/database/packages/dnd35-from-parser/tools/detect/readers/modifiers/grants.ts";
import type { BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import { stripClassSuffix } from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";

import { type ClassAptitudePicks, expandAptitudePicks } from "./aptitudePicks.ts";

/** A class feature, as the class's mapping holds it. */
export type MappedFeature = ClassReference["mapping"]["features"][string];

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

  /** Its book's seeds. */
  readonly book: BaseBookSeeds;
  /** The class's slug, as its paths name it (`classes.wujen.level`). */
  readonly classSlug: string;
  /** The existing feat each feature grants, by its name and description. */
  private readonly existingFeats = new Map<string, string | undefined>();
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
            ? readGrantedFeatNames(description)
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
