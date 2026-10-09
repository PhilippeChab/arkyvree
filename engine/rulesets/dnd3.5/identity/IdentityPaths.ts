import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/character/CharacterComponents.ts";
import {
  getNumericOperators,
  MODIFIER_OPERATORS,
  NUMERIC_REQUIREMENT_OPERATORS,
} from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";

const NAVIGATABLE_BACKGROUND_PATHS = [{ path: "notes", description: "Public notes", type: "string" as const }];

const NAVIGATABLE_BELIEFS_PATHS = [
  { path: "deity", description: "Character deity", type: "string" as const },
  { path: "alignment", description: "e.g., Lawful Good", type: "string" as const },
];

const NAVIGATABLE_IDENTITY_PATHS = [
  { path: "name", description: "Character name", type: "string" as const },
  { path: "description", description: "Physical description", type: "string" as const },
  { path: "age", description: "Character age", type: "number" as const },
  { path: "gender", description: "Character gender", type: "string" as const },
  { path: "height", description: "Character height", type: "string" as const },
  { path: "weight", description: "Body weight", type: "string" as const },
  { path: "race.name", description: "Race name", type: "string" as const },
  { path: "race.size", description: "Size (e.g., Medium, Small)", type: "string" as const },
];

const NAVIGATABLE_META_PATHS = [
  { path: "level", description: "Total character level (all classes combined)", type: "number" as const },
  { path: "xp", description: "Current experience points", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  xp: "Experience Points",
};

/** The identity's target paths: physiology, beliefs, background, level and XP. */
export default class IdentityPaths implements PathCategory<Dnd35Components> {
  static generateIdentityPaths(kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const subPath of NAVIGATABLE_IDENTITY_PATHS) {
      paths.push({
        path: `identity.physiology.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators:
          kind === "modifier"
            ? subPath.type === "string"
              ? ["set"]
              : [...MODIFIER_OPERATORS]
            : subPath.type === "string"
              ? ["equal", "not_equal"]
              : [...NUMERIC_REQUIREMENT_OPERATORS],
      });
    }

    for (const subPath of NAVIGATABLE_BELIEFS_PATHS) {
      paths.push({
        path: `identity.beliefs.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
      });
    }

    for (const subPath of NAVIGATABLE_BACKGROUND_PATHS) {
      paths.push({
        path: `identity.background.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
      });
    }

    for (const subPath of NAVIGATABLE_META_PATHS) {
      paths.push({
        path: `identity.meta.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: getNumericOperators(kind),
      });
    }

    return paths;
  }

  readonly component = { key: "identity", getter: "getIdentity" } as const;

  readonly description = "Physiology, level, XP, and background";

  readonly label = "Identity";

  readonly name = "identity";

  readonly pathDescriptions = {
    "identity.physiology": "Character name, description, age, gender, height, weight",
    "identity.beliefs": "Deity and alignment",
    "identity.background": "Notes",
    "identity.meta": "Character level and experience points",
    "identity.physiology.race": "Character race name and size",
  };

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return IdentityPaths.generateIdentityPaths(kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(
      [
        ...NAVIGATABLE_IDENTITY_PATHS,
        ...NAVIGATABLE_BELIEFS_PATHS,
        ...NAVIGATABLE_BACKGROUND_PATHS,
        ...NAVIGATABLE_META_PATHS,
      ],
      { physiology: "Physiology", beliefs: "Beliefs", background: "Background", meta: "Meta", ...SEGMENT_LABELS },
    );
  }
}
