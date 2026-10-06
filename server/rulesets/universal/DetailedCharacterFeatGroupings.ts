import type DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import type { FeatEntry } from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import { NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type FeatGroup = Record<string, FeatEntry>;
type FeatGroupingsData = Record<string, FeatGroup>;

const NAVIGATABLE_PATHS = [
  { path: "possessed", description: "Whether this feat is possessed", type: "boolean" as const },
  { path: "count", description: "Times this feat was taken", type: "number" as const, requirementOnly: true },
];

/**
 * A family's `count`: how many times the character has its feats, all together (every class's sneak attack dice). It's
 * read when checked, and isn't enumerable: the family's wildcard (`feats.<family>.*`) reaches its feats only, never
 * their count.
 */
const FAMILY_COUNT = "count";

function familyGroup(): FeatGroup {
  const group: FeatGroup = {};
  Object.defineProperty(group, FAMILY_COUNT, {
    get: () => Object.values(group).reduce((total, feat) => total + feat.count, 0),
  });
  return group;
}

export default class DetailedCharacterFeatGroupings {
  constructor(
    private readonly detailedCharacterFeats: DetailedCharacterFeats,
    private readonly groupingProperties: readonly string[],
  ) {}

  static getSegmentLabels(): Record<string, string> {
    return { possessed: "Possessed", [FAMILY_COUNT]: "Count" };
  }

  /**
   * Each family's wildcard paths, and its count's. A family named like a feat shares the feat's key, where `count` is
   * the feat's (`DetailedCharacterFeats.injectGroupings`): the family's count isn't reachable there.
   */
  static generateTargetPaths(
    featGroupings: string[],
    kind: "modifier" | "requirement",
    labels: Record<string, string>,
    featKeys: ReadonlySet<string>,
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of featGroupings) {
      const displayName = labels[grouping] || grouping;
      for (const subPath of NAVIGATABLE_PATHS) {
        if (subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `feats.${grouping}.*.${subPath.path}`,
          category: "feats",
          description: `${kind === "requirement" ? "Any" : "All"} ${displayName} feats — ${subPath.description}`,
          groupDescription: `${kind === "requirement" ? "Any" : "All"} ${displayName} feats`,
          valueType: subPath.type,
          operators:
            kind === "modifier"
              ? ["set"]
              : subPath.type === "number"
                ? [...NUMERIC_REQUIREMENT_OPERATORS]
                : ["equal", "not_equal"],
        });
      }
      if (kind === "requirement" && !featKeys.has(grouping)) {
        paths.push({
          path: `feats.${grouping}.${FAMILY_COUNT}`,
          category: "feats",
          description: `${displayName} feats — Times taken, all together`,
          groupDescription: `${displayName} feats`,
          valueType: "number",
          operators: [...NUMERIC_REQUIREMENT_OPERATORS],
        });
      }
    }

    return paths;
  }

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

      // Get the shared feat state ref from DetailedCharacterFeats
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
