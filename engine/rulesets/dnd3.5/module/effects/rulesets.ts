import type { PropertiesWrite } from "@/engine/core/module/index.ts";
import type { RulesetFields } from "@/engine/rulesets/dnd3.5/module/rules/index.ts";

/** What a ruleset writes when its own fields are saved. */
export interface RulesetsEffects {
  /** The ruleset's own fields, as the properties stored in place of those it stored before. */
  properties(rulesetId: string, fields: RulesetFields): PropertiesWrite;
}
