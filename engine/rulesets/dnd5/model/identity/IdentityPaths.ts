import type { NamedValue, PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd5Components } from "@/engine/rulesets/dnd5/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import {
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5/characterKinds.ts";

const NAVIGATABLE_BACKGROUND_PATHS = [
  { path: "name", description: "Background name (e.g., Sage)", type: "string" as const, requirementOnly: true },
  { path: "notes", description: "Public notes", type: "string" as const },
];

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
  { path: "species.name", description: "Species name", type: "string" as const },
  { path: "species.size", description: "Size (e.g., Medium, Small)", type: "string" as const },
];

const NAVIGATABLE_META_PATHS = [
  { path: "level", description: "Total character level (all classes combined)", type: "number" as const },
  { path: "xp", description: "Current experience points", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  xp: "Experience Points",
};

/** The identity's target paths: physiology, beliefs, background, level and XP. */
export default class IdentityPaths implements PathCategory<Dnd5Components> {
  static generateIdentityPaths(kind: OperatorKind): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const subPath of NAVIGATABLE_IDENTITY_PATHS) {
      paths.push({
        path: `identity.physiology.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: getOperators(subPath.type, kind),
      });
    }

    for (const subPath of NAVIGATABLE_BELIEFS_PATHS) {
      paths.push({
        path: `identity.beliefs.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: getOperators(subPath.type, kind),
      });
    }

    for (const subPath of NAVIGATABLE_BACKGROUND_PATHS) {
      if (!isLeafOfKind(subPath, kind)) continue;
      paths.push({
        path: `identity.background.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: getOperators(subPath.type, kind),
      });
    }

    for (const subPath of NAVIGATABLE_META_PATHS) {
      paths.push({
        path: `identity.meta.${subPath.path}`,
        category: "identity",
        description: subPath.description,
        valueType: subPath.type,
        operators: getOperators(subPath.type, kind),
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
    "identity.physiology.species": "Character species name and size",
  };

  generate(_rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
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

  /** A character's species' name is a player's species', and its background's a background's. */
  valueNames(path: string): NamedValue | undefined {
    if (path === "identity.background.name") return { entityType: "backgrounds" };
    return path === "identity.physiology.species.name"
      ? { entityType: "species", partition: PLAYER_CHARACTER_KIND }
      : undefined;
  }
}
