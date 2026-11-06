import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd52Components } from "@/engine/rulesets/dnd5.2/model/CharacterComponents.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Klass } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { getOperators, LEVEL_MODIFIER_OPERATORS } from "@/shared/customization/operators.ts";
import {
  deriveNameLabels,
  deriveSegmentLabels,
  isLeafOfKind,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class's paths, `{name}` its name: its levels, which a subclass's features are gated by. */
const CLASS_PATHS = [
  { path: "level", description: "Number of {name} levels taken", type: "number" as const, requirementOnly: false },
];

/** The classes' target paths: each class's level. */
export default class ClassesPaths implements PathCategory<Dnd52Components> {
  static generateClassPaths(classes: Klass[], kind: OperatorKind): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const klass of classes) {
      const normalizedClassName = stripSeparators(klass.name);

      for (const subPath of CLASS_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        paths.push({
          path: `classes.${normalizedClassName}.${subPath.path}`,
          category: "classes",
          description: subPath.description.replace("{name}", klass.name),
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind, LEVEL_MODIFIER_OPERATORS),
        });
      }
    }

    return paths;
  }

  /** A class's level (`classes.<slug>.level`), by the class's name. */
  static level(className: string): string {
    return `classes.${stripSeparators(className)}.level`;
  }

  readonly component = { key: "classes", getter: "getClasses" } as const;

  readonly description = "Class levels";

  readonly groupDescriptionTemplates = { classes: "{name} class level" };

  readonly label = "Classes";

  readonly name = "classes";

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return ClassesPaths.generateClassPaths(Dnd52View.of(rulesetData).classes, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(CLASS_PATHS);
  }

  /** The ruleset's classes, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Dnd52View.of(rulesetData).classes.map(({ name }) => name)) };
  }
}
