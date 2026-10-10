import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import { deriveNameLabels, deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";
import type { Feat } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

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

/** Every family the rules know, by its slug: listed whether a feat of the ruleset is in it or not. */
const KNOWN_FAMILY_LABELS: Record<string, string> = Object.fromEntries(
  FEAT_FAMILIES.map((family) => [stripSeparators(family), family]),
);

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
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `feats.${grouping}.*.${subPath.path}`,
          category: "feats",
          description: `${kind === "requirement" ? "Any" : "All"} ${displayName} feats — ${subPath.description}`,
          groupDescription: `${kind === "requirement" ? "Any" : "All"} ${displayName} feats`,
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
        });
      }
      if (kind === "requirement" && !featKeys.has(grouping)) {
        paths.push({
          path: `feats.${grouping}.${FAMILY_COUNT}`,
          category: "feats",
          description: `${displayName} feats — Times taken, all together`,
          groupDescription: `${displayName} feats`,
          valueType: "number",
          operators: getOperators("number", kind),
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
        if (!isLeafOfKind(subPath, kind)) continue;
        if ("stackableOnly" in subPath && subPath.stackableOnly && !feat.stackable) continue;

        paths.push({
          path: `feats.${normalizedFeatName}.${subPath.path}`,
          category: "feats",
          description: subPath.description,
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
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
    const featGroupingLabels = { ...KNOWN_FAMILY_LABELS };
    // Every family a feat of the ruleset names
    for (const family of FEAT_FIELDS.read(rulesetData.propertiesByEntityType.get("feats") ?? []).families)
      featGroupingLabels[stripSeparators(family)] = family;

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
    return deriveSegmentLabels([...FEAT_PATHS, ...FAMILY_PATHS]);
  }

  /**
   * The ruleset's feats, labeled by their names; and, where no other label names them, every family the rules know,
   * its feats' properties' values, and a family's wildcard ("Weapon Focus (Any)").
   */
  labelNames(rulesetData: RulesetData) {
    const fallbacks = { ...KNOWN_FAMILY_LABELS };
    for (const { type, value } of rulesetData.propertiesByEntityType.get("feats") ?? []) {
      const slug = stripSeparators(value);
      if (!slug) continue;
      fallbacks[slug] ??= value;
      if (type === FEAT_FAMILY) fallbacks[`${slug}*`] ??= `${value} (Any)`;
    }
    return { fallbacks, names: deriveNameLabels(rulesetData.feats.map(({ name }) => name)) };
  }
}
