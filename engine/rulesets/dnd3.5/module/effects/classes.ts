import type { PropertiesWrite } from "@/engine/core/module/index.ts";
import type { ClassFields } from "@/engine/rulesets/dnd3.5/module/rules/index.ts";

/** What a ruleset writes when a class is saved: its fields. */
export interface ClassesEffects {
  /** The class's fields, as the properties stored in place of those it stored before. */
  properties(klassId: string, fields: ClassFields): PropertiesWrite;
}
