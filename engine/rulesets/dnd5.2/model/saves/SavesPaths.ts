import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd52Components } from "@/engine/rulesets/dnd5.2/model/CharacterComponents.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { RulesetSave } from "@/engine/rulesets/dnd5.2/view/rows.ts";
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
  { path: "ability", description: "From its ability's modifier", type: "number" as const, requirementOnly: true },
  { path: "proficient", description: "Whether the character is proficient in the saving throw", type: "boolean" as const },
  {
    path: "proficiency",
    description: "The Proficiency Bonus, when proficient",
    type: "number" as const,
    requirementOnly: true,
  },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final saving throw bonus", type: "number" as const, requirementOnly: true },
];

/** The saving throws' target paths: each save's components. */
export default class SavesPaths implements PathCategory<Dnd52Components> {
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

  readonly description = "Saving throws, one for each ability";

  readonly groupDescriptionTemplates = { saves: "{name} saving throw components" };

  readonly label = "Saving Throws";

  readonly name = "saves";

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return SavesPaths.generateSavePaths(Dnd52View.of(rulesetData).saves, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  /** The ruleset's saves, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Dnd52View.of(rulesetData).saves.map(({ name }) => name)) };
  }
}
