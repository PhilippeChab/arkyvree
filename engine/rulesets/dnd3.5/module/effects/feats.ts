import type { PropertiesWrite } from "@/engine/core/module/index.ts";
import type { FeatFields } from "@/engine/rulesets/dnd3.5/module/rules/index.ts";

/** What a ruleset writes when a feat is saved: its fields. */
export interface FeatsEffects {
  /** The feat's fields, as the properties stored in place of those it stored before. */
  properties(featId: string, fields: FeatFields): PropertiesWrite;
}
