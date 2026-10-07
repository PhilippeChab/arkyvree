import type FeatsComponent from "@/server/rulesets/dnd3.5/feats/FeatsComponent.ts";
import type { FeatEntry } from "@/server/rulesets/dnd3.5/feats/FeatsComponent.ts";
import type { Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { FAMILY_COUNT } from "./FeatsPaths.ts";

type FeatGroup = Record<string, FeatEntry>;
type FeatGroupingsData = Record<string, FeatGroup>;

function familyGroup(): FeatGroup {
  const group: FeatGroup = {};
  Object.defineProperty(group, FAMILY_COUNT, {
    get: () => Object.values(group).reduce((total, feat) => total + feat.count, 0),
  });
  return group;
}

export default class FeatGroupingsComponent {
  constructor(
    private readonly detailedCharacterFeats: FeatsComponent,
    private readonly groupingProperties: readonly string[],
  ) {}

  private readonly featGroupings: FeatGroupingsData = {};

  getFeatGroupings(): FeatGroupingsData {
    return this.featGroupings;
  }

  registerFeat(feat: { name: string }, properties: Property[]): void {
    for (const prop of properties) {
      if (!this.groupingProperties.includes(prop.type)) continue;

      const familyName = prop.value;
      const normalizedFamily = stripSeparators(familyName);

      // Derive variant key: strip "Family: " prefix from feat name
      const prefix = `${familyName}: `;
      const variant = feat.name.startsWith(prefix)
        ? stripSeparators(feat.name.slice(prefix.length))
        : stripSeparators(feat.name);
      // A variant named like the family's count stays out of the family
      if (variant === FAMILY_COUNT) continue;

      // Get the shared feat state ref from FeatsComponent
      const featState = this.detailedCharacterFeats.getFeat(feat.name);
      if (!featState) continue;

      if (!this.featGroupings[normalizedFamily]) {
        this.featGroupings[normalizedFamily] = familyGroup();
      }
      this.featGroupings[normalizedFamily][variant] = featState;
    }
  }

  /**
   * An empty group for each of these families that no feat of the ruleset is in: a check of one (an extension's
   * prestige class needing another book's ki power) is unmet, rather than naming nothing.
   */
  seedEmptyFamilies(families: readonly string[]): void {
    for (const family of families) {
      const key = stripSeparators(family);
      if (key && !this.featGroupings[key]) this.featGroupings[key] = familyGroup();
    }
  }
}
