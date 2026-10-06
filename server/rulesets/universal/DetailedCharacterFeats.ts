import { NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { Feat } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type FeatGroupEntry = Record<string, FeatEntry>;

type DetailedCharacterComprehensiveFeats = {
  [key: string]: FeatEntry | FeatGroupEntry;
};

export type FeatEntry = {
  name: string;
  possessed: boolean;
  count: number;
};

const NAVIGATABLE_PATHS = [
  { path: "possessed", description: "Whether the character has this feat", type: "boolean" as const },
  {
    path: "count",
    description: "Times taken (stackable feats only)",
    type: "number" as const,
    requirementOnly: true,
    stackableOnly: true,
  },
];

/** A feat's entry, not a family's group: a group's values are its feats. */
function isFeatEntry(entry: FeatEntry | FeatGroupEntry | undefined): entry is FeatEntry {
  return typeof entry?.possessed === "boolean";
}

export default class DetailedCharacterFeats {
  static getSegmentLabels(): Record<string, string> {
    return { possessed: "Possessed", count: "Count" };
  }

  static generateTargetPaths(feats: Feat[], kind: "modifier" | "requirement"): TargetPath[] {
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
                ? [...NUMERIC_REQUIREMENT_OPERATORS]
                : ["equal", "not_equal"],
        });
      }
    }

    return paths;
  }

  private readonly detailedCharacterFeats: DetailedCharacterComprehensiveFeats = {};

  initialize(rulesetFeats: Feat[], possessedFeats: Feat[]) {
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

  /** The feat of that name: none for a family's name, whose group no feat shares. */
  getFeat(featName: string): FeatEntry | undefined {
    const entry = this.detailedCharacterFeats[stripSeparators(featName)];
    return isFeatEntry(entry) ? entry : undefined;
  }

  getFeats() {
    return this.detailedCharacterFeats;
  }

  /**
   * Each family's feats under its name, so `feats.<family>.*` reaches them. A family named like a feat ("Martial
   * Weapon Proficiency") shares the feat's key: its feats join the feat's entry, beside the feat's own fields, so
   * `feats.<name>.possessed` is the feat's and `feats.<name>.*` its family's.
   */
  injectGroupings(groupings: Record<string, Record<string, FeatEntry>>) {
    for (const [key, group] of Object.entries(groupings)) {
      const feat = this.detailedCharacterFeats[key];
      if (!feat) {
        this.detailedCharacterFeats[key] = group;
        continue;
      }
      for (const [variant, member] of Object.entries(group)) {
        // The feat itself, if it's in its own family, and a variant named like one of its fields stay out
        if (member !== feat && !(variant in feat)) (feat as FeatGroupEntry)[variant] = member;
      }
    }
  }
}
