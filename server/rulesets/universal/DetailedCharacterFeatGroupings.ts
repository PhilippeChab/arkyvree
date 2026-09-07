import type DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import type { FeatEntry } from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";

const NAVIGATABLE_PATHS = [
  { path: "possessed", description: "Whether this feat is possessed", type: "boolean" as const },
];

type FeatGroup = Record<string, FeatEntry>;
type FeatGroupingsData = Record<string, FeatGroup>;

export default class DetailedCharacterFeatGroupings {
  static getSegmentLabels(): Record<string, string> {
    return { possessed: "Possessed" };
  }

  static generateTargetPaths(
    featGroupings: string[],
    kind: "modifier" | "requirement",
    labels?: Record<string, string>,
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of featGroupings) {
      const displayName = labels?.[grouping] || grouping;
      for (const subPath of NAVIGATABLE_PATHS) {
        paths.push({
          path: `feats.${grouping}.*.${subPath.path}`,
          category: "feats",
          description: `${kind === "requirement" ? "Any" : "All"} ${displayName} feats — ${subPath.description}`,
          groupDescription: `${kind === "requirement" ? "Any" : "All"} ${displayName} feats`,
          valueType: subPath.type,
          operators: kind === "modifier"
            ? ["set"]
            : ["equal", "not_equal"],
        });
      }
    }

    return paths;
  }

  private readonly featGroupings: FeatGroupingsData = {};

  constructor(
    private readonly detailedCharacterFeats: DetailedCharacterFeats,
    private readonly groupingProperties: readonly string[],
  ) {}

  registerFeat(
    feat: { name: string },
    properties: Property[],
  ): void {
    for (const prop of properties) {
      if (!this.groupingProperties.includes(prop.type)) continue;

      const familyName = prop.value;
      const normalizedFamily = stripSeparators(familyName);

      // Derive variant key: strip "Family: " prefix from feat name
      const prefix = `${familyName}: `;
      const variant = feat.name.startsWith(prefix)
        ? stripSeparators(feat.name.slice(prefix.length))
        : stripSeparators(feat.name);

      // Get the shared feat state ref from DetailedCharacterFeats
      const featState = this.detailedCharacterFeats.getFeat(feat.name);
      if (!featState) continue;

      if (!this.featGroupings[normalizedFamily]) {
        this.featGroupings[normalizedFamily] = {};
      }
      this.featGroupings[normalizedFamily][variant] = featState;
    }
  }

  getFeatGroupings(): FeatGroupingsData {
    return this.featGroupings;
  }
}
