import type { RulesetFields } from "@/engine/core/module/rules/index.ts";

import type { PropertiesWrite } from "./writes.ts";

/** What a ruleset writes when its own fields are saved. */
export interface RulesetsEffects {
  /** The ruleset's own fields, as the properties stored in place of those it stored before. */
  properties(rulesetId: string, fields: RulesetFields): PropertiesWrite;
}
