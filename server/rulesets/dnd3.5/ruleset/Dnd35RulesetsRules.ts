import type { RulesetFields, RulesetsRules } from "@/server/rulesets/engine/module/index.ts";

import { readRulesetFields } from "./rulesetFields.ts";

export class Dnd35RulesetsRules implements RulesetsRules {
  readProperties(properties: { type: string; value: string }[]): RulesetFields {
    return readRulesetFields(properties);
  }
}
