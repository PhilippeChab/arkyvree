import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The classes' target paths: each class's level and caster level. */
export default class ClassesPaths implements PathCategory {
  readonly name = "classes";
  readonly label = "Classes";
  readonly description = "Class levels and bonus caster levels";
  readonly holder = { key: "classes", getter: "getClasses" };
  readonly groupDescriptionTemplates = { classes: "{name} class level and caster level" };
}
