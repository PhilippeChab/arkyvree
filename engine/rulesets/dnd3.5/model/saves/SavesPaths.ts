import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import type { RulesetSave } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_PATHS = [
  { path: "base", description: "Base save bonus from class levels", type: "number" as const },
  { path: "ability", description: "From key ability modifier", type: "number" as const, requirementOnly: true },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final saving throw bonus", type: "number" as const, requirementOnly: true },
];

/** The saving throws' target paths: each save's components. */
export default class SavesPaths implements PathCategory<Dnd35Components> {
  static generateSavePaths(saves: Pick<RulesetSave, "name">[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const save of saves) {
      const normalizedSaveName = stripSeparators(save.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `saves.${normalizedSaveName}.${subPath.path}`,
          category: "saves",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
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

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return SavesPaths.generateSavePaths(rulesetData.saves, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }
}
