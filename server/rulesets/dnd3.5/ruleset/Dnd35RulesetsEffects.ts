import type { PropertiesWrite, RulesetFields, RulesetsEffects } from "@/server/rulesets/engine/module/index.ts";

import { RULESET_FIELD_PROPERTY_TYPES, toRulesetProperties } from "./rulesetFields.ts";

export class Dnd35RulesetsEffects implements RulesetsEffects {
  properties(rulesetId: string, fields: RulesetFields): PropertiesWrite {
    return {
      entityId: rulesetId,
      entityType: "rulesets",
      types: RULESET_FIELD_PROPERTY_TYPES,
      rows: toRulesetProperties(rulesetId, fields),
    };
  }
}
