import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import { NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import type { Feat } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

const FAMILY_PATHS = [
  { path: "possessed", description: "Whether this feat is possessed", type: "boolean" as const },
  { path: "count", description: "Times this feat was taken", type: "number" as const, requirementOnly: true },
];

const FEAT_PATHS = [
  { path: "possessed", description: "Whether the character has this feat", type: "boolean" as const },
  {
    path: "count",
    description: "Times taken (stackable feats only)",
    type: "number" as const,
    requirementOnly: true,
    stackableOnly: true,
  },
];

/**
 * A family's `count`: how many times the character has its feats, all together (every class's sneak attack dice). It's
 * read when checked, and isn't enumerable: the family's wildcard (`feats.<family>.*`) reaches its feats only, never
 * their count.
 */
export const FAMILY_COUNT = "count";

/** The feats' target paths: each feat's possession and count, and its family's. */
export default class FeatsPaths implements PathCategory<Dnd35Components> {
  /**
   * Each family's wildcard paths, and its count's. A family named like a feat shares the feat's key, where `count` is
   * the feat's (`FeatsComponent.injectGroupings`): the family's count isn't reachable there.
   */
  static generateFamilyPaths(
    featGroupings: string[],
    kind: "modifier" | "requirement",
    labels: Record<string, string>,
    featKeys: ReadonlySet<string>,
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of featGroupings) {
      const displayName = labels[grouping] || grouping;
      for (const subPath of FAMILY_PATHS) {
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

  static generateFeatPaths(feats: Feat[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const feat of feats) {
      const normalizedFeatName = stripSeparators(feat.name);

      for (const subPath of FEAT_PATHS) {
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

  /** The feat whose possession a target names (`feats.<slug>.possessed`), or undefined for another target. */
  static parsePossessed(target: string): string | undefined {
    const parts = target.split(".");
    return parts.length === 3 && parts[0] === "feats" && parts[2] === "possessed" ? parts[1] : undefined;
  }

  /** A feat's possession (`feats.<slug>.possessed`): what a modifier sets to grant it, and a requirement checks. */
  static possessed(slug: string): string {
    return `feats.${slug}.possessed`;
  }

  readonly component = { key: "feats", getter: "getFeats" } as const;
  readonly description = "Feat possession and stackable count";
  readonly groupDescriptionTemplates = { feats: "{name} feat possession" };
  readonly label = "Feats";
  readonly name = "feats";

  /** Every family the rules know, a feat of the ruleset in it or not (an extension's checks of another book's), by its slug. */
  private familyLabels(rulesetData: RulesetData) {
    const featGroupingLabels: Record<string, string> = Object.fromEntries(
      FEAT_FAMILIES.map((family) => [stripSeparators(family), family]),
    );
    for (const prop of rulesetData.propertiesByEntityType.get("feats") ?? [])
      if (prop.type === FEAT_FAMILY) featGroupingLabels[stripSeparators(prop.value)] = prop.value;

    return featGroupingLabels;
  }

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    const { feats } = rulesetData;
    const familyLabels = this.familyLabels(rulesetData);
    return [
      ...FeatsPaths.generateFeatPaths(feats, kind),
      ...FeatsPaths.generateFamilyPaths(
        Object.keys(familyLabels),
        kind,
        familyLabels,
        new Set(feats.map((feat) => stripSeparators(feat.name))),
      ),
    ];
  }

  getSegmentLabels(): Record<string, string> {
    return { possessed: "Possessed", [FAMILY_COUNT]: "Count" };
  }
}
