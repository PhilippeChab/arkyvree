import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import { getOperators, LEVEL_MODIFIER_OPERATORS } from "@/shared/customization/operators.ts";
import { deriveNameLabels, deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";
import type { Klass } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A class's paths, `{name}` its name: its levels, and the caster levels prestige classes add to it (a modifier's). */
const CLASS_PATHS = [
  { path: "level", description: "Number of {name} levels taken", type: "number" as const },
  {
    path: "bonuscasterlevel",
    description: "{name} bonus caster levels from prestige classes",
    type: "number" as const,
    modifierOnly: true,
  },
];

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

  readonly description = "Class levels and bonus caster levels";

  readonly groupDescriptionTemplates = { classes: "{name} class level and caster level" };

  readonly label = "Classes";

  readonly name = "classes";

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return ClassesPaths.generateClassPaths(rulesetData.klasses, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(CLASS_PATHS, { bonuscasterlevel: "Bonus Caster Level" });
  }

  /** The ruleset's classes, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(rulesetData.klasses.map(({ name }) => name)) };
  }
}
