import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { Dnd35Components } from "@/engine/rulesets/dnd3.5/character/components.ts";
import { NUMERIC_REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { Klass } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The classes' target paths: each class's level and caster level. */
export default class ClassesPaths implements PathCategory<Dnd35Components> {
  /** A class's bonus caster levels (`classes.<slug>.bonuscasterlevel`), by the class's name. */
  static bonusCasterLevel(className: string): string {
    return `classes.${stripSeparators(className)}.bonuscasterlevel`;
  }

  static generateClassPaths(klasses: Klass[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const klass of klasses) {
      const normalizedClassName = stripSeparators(klass.name);

      paths.push({
        path: `classes.${normalizedClassName}.level`,
        category: "classes",
        description: `Number of ${klass.name} levels taken`,
        valueType: "number",
        operators: kind === "modifier" ? ["add", "subtract", "set"] : [...NUMERIC_REQUIREMENT_OPERATORS],
      });

      if (kind === "modifier") {
        paths.push({
          path: `classes.${normalizedClassName}.bonuscasterlevel`,
          category: "classes",
          description: `${klass.name} bonus caster levels from prestige classes`,
          valueType: "number",
          operators: ["add", "subtract", "set"],
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

  readonly description = "Class levels and bonus caster levels";

  readonly groupDescriptionTemplates = { classes: "{name} class level and caster level" };

  readonly label = "Classes";

  readonly name = "classes";

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return ClassesPaths.generateClassPaths(rulesetData.klasses, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return { level: "Level", bonuscasterlevel: "Bonus Caster Level" };
  }
}
