import type { ClassFields } from "@/engine/core/module/rules/index.ts";

import type { PropertiesWrite } from "./writes.ts";

/** What a ruleset writes when a class is saved: its fields. */
export interface ClassesEffects {
  /** The class's fields, as the properties stored in place of those it stored before. */
  properties(klassId: string, fields: ClassFields): PropertiesWrite;
}
