import type { FeatFields } from "@/engine/core/module/rules/index.ts";

import type { PropertiesWrite } from "./writes.ts";

/** What a ruleset writes when a feat is saved: its fields. */
export interface FeatsEffects {
  /** The feat's fields, as the properties stored in place of those it stored before. */
  properties(featId: string, fields: FeatFields): PropertiesWrite;
}
