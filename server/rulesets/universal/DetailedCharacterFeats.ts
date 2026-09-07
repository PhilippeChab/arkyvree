import type { TargetPath } from "@/shared/customization/target.ts";
import type { Feat } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";

const NAVIGATABLE_PATHS = [
  { path: "possessed", description: "Whether the character has this feat", type: "boolean" as const },
  { path: "count", description: "Times taken (stackable feats only)", type: "number" as const, requirementOnly: true, stackableOnly: true },
];

export type FeatEntry = {
  name: string;
  possessed: boolean;
  count: number;
};

type FeatGroupEntry = Record<string, FeatEntry>;

export type DetailedCharacterComprehensiveFeats = {
  [key: string]: FeatEntry | FeatGroupEntry;
};

export default class DetailedCharacterFeats {
  static getSegmentLabels(): Record<string, string> {
    return { possessed: "Possessed", count: "Count" };
  }

  static generateTargetPaths(
    feats: Feat[],
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const feat of feats) {
      const normalizedFeatName = stripSeparators(feat.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        if ("stackableOnly" in subPath && subPath.stackableOnly && !feat.stackable) continue;

        paths.push({
          path: `feats.${normalizedFeatName}.${subPath.path}`,
          category: "feats",
          description: subPath.description,
          valueType: subPath.type,
          operators:
            kind === "modifier"
              ? ["set"]
              : subPath.type === "number"
                ? ["equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"]
                : ["equal", "not_equal"],
        });
      }
    }

    return paths;
  }

  private readonly detailedCharacterFeats: DetailedCharacterComprehensiveFeats = {};

  initialize(
    rulesetFeats: Feat[],
    possessedFeats: Feat[],
  ) {
    const possessedCounts = new Map<string, number>();
    for (const feat of possessedFeats) {
      const name = stripSeparators(feat.name);
      possessedCounts.set(name, (possessedCounts.get(name) ?? 0) + 1);
    }

    for (const feat of rulesetFeats) {
      const normalizedName = stripSeparators(feat.name);
      const count = possessedCounts.get(normalizedName) ?? 0;

      this.detailedCharacterFeats[normalizedName] = {
        name: feat.name,
        possessed: count > 0,
        count,
      };
    }
  }

  injectGroupings(groupings: Record<string, Record<string, FeatEntry>>) {
    for (const [key, group] of Object.entries(groupings)) {
      if (!(key in this.detailedCharacterFeats)) {
        this.detailedCharacterFeats[key] = group;
      }
    }
  }

  getFeats() {
    return this.detailedCharacterFeats;
  }

  getFeat(featName: string) {
    return this.detailedCharacterFeats[stripSeparators(featName)] as FeatEntry | undefined;
  }
}
