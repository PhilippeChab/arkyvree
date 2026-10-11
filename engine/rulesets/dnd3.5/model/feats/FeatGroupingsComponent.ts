import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";

import type FeatsComponent from "./FeatsComponent.ts";
import type { FeatEntry } from "./FeatsComponent.ts";
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

/** A character's feat families: each family's feats, the feats component's own entries, under the family's name. */
export default class FeatGroupingsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly feats: FeatsComponent) {
    super();
  }

  private readonly featGroupings: FeatGroupingsData = {};

  /**
   * Every family of the ruleset's feats, each feat of it there whether the character has it or not, so a check of any
   * of them reads the whole family, and an empty group for each of the books' families no feat is in (`FEAT_FAMILIES`).
   * Then the feats component holds them under their names (`FeatsComponent.injectGroupings`): the one component that
   * fills another, since the families hold the feats' own entries.
   */
  override initialize(_data: LoadedCharacterData, { rulesetData }: RulesetView) {
    const rulesetFeatsById = new Map(rulesetData.feats.map((feat) => [feat.id, feat]));
    for (const prop of rulesetData.propertiesByEntityType.get("feats") ?? []) {
      const feat = rulesetFeatsById.get(prop.entityId);
      if (feat) this.registerFeat(feat, [prop]);
    }
    this.seedEmptyFamilies(FEAT_FAMILIES);
    this.feats.injectGroupings(this.featGroupings);
  }

  /**
   * An empty group for each of these families that no feat of the ruleset is in: a check of one (an extension's
   * prestige class needing another book's ki power) is unmet, rather than naming nothing.
   */
  private seedEmptyFamilies(families: readonly string[]): void {
    for (const family of families) {
      const key = stripSeparators(family);
      if (key && !this.featGroupings[key]) this.featGroupings[key] = familyGroup();
    }
  }

  getFeatGroupings(): FeatGroupingsData {
    return this.featGroupings;
  }

  /** The feat in each family its properties name. */
  registerFeat(feat: { name: string }, properties: Property[]): void {
    for (const familyName of FEAT_FIELDS.read(properties).families) {
      const normalizedFamily = stripSeparators(familyName);

      // Derive variant key: strip "Family: " prefix from feat name
      const prefix = `${familyName}: `;
      const variant = feat.name.startsWith(prefix)
        ? stripSeparators(feat.name.slice(prefix.length))
        : stripSeparators(feat.name);
      // A variant named like the family's count stays out of the family
      if (variant === FAMILY_COUNT) continue;

      // Get the shared feat state ref from FeatsComponent
      const featState = this.feats.getFeat(feat.name);
      if (!featState) continue;

      if (!this.featGroupings[normalizedFamily]) this.featGroupings[normalizedFamily] = familyGroup();

      this.featGroupings[normalizedFamily][variant] = featState;
    }
  }
}
