import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";

/** The highest spell level castable, of each kind: computed from the character's classes, a requirement's only. */
const SPELLCASTING_PATHS = [
  { path: "arcane", description: "Max arcane spell level castable", type: "number" as const, requirementOnly: true },
  { path: "divine", description: "Max divine spell level castable", type: "number" as const, requirementOnly: true },
];

/** The spellcasting target paths: the highest arcane and divine spell levels castable. */
export default class SpellcastingPaths implements PathCategory<Dnd35Components> {
  readonly component = { key: "spellcasting", getter: "getSpellcasting" } as const;
  readonly description = "Maximum arcane or divine spell level castable";
  readonly label = "Spellcasting";
  readonly name = "spellcasting";

  generate(_rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return SPELLCASTING_PATHS.filter((subPath) => isLeafOfKind(subPath, kind)).map((subPath) => ({
      path: `spellcasting.${subPath.path}`,
      category: "spellcasting",
      description: subPath.description,
      valueType: subPath.type,
      operators: getOperators(subPath.type, kind),
    }));
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(SPELLCASTING_PATHS);
  }
}
