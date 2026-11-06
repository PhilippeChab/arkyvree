import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Pf1Components } from "@/engine/rulesets/pf1/model/CharacterComponents.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import type { RulesetSave } from "@/engine/rulesets/pf1/view/rows.ts";
import { getNumericOperators, getOperators } from "@/shared/customization/operators.ts";
import {
  deriveNameLabels,
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_PATHS = [
  { path: "base", description: "Base save bonus from class levels", type: "number" as const },
  { path: "ability", description: "From key ability modifier", type: "number" as const, requirementOnly: true },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final saving throw bonus", type: "number" as const, requirementOnly: true },
];

/** The saving throws' target paths: each save's components. */
export default class SavesPaths implements PathCategory<Pf1Components> {
  static generateSavePaths(saves: Pick<RulesetSave, "name">[], kind: OperatorKind): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const save of saves) {
      const normalizedSaveName = stripSeparators(save.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `saves.${normalizedSaveName}.${subPath.path}`,
          category: "saves",
          description: subPath.description,
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
        });
      }
    }

    paths.push({
      path: "saves.*.misc",
      category: "saves",
      description: "Misc bonus applied to every save",
      groupDescription: kind === "requirement" ? "Any saving throw" : "All saving throws",
      valueType: "number",
      operators: getNumericOperators(kind),
    });

    return paths;
  }

  readonly component = { key: "saves", getter: "getSaves" } as const;

  readonly description = "Fortitude, Reflex, and Will saving throws";

  readonly groupDescriptionTemplates = { saves: "{name} saving throw components" };

  readonly label = "Saving Throws";

  readonly name = "saves";

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return SavesPaths.generateSavePaths(Pf1View.of(rulesetData).saves, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  /** The ruleset's saves, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Pf1View.of(rulesetData).saves.map(({ name }) => name)) };
  }
}
