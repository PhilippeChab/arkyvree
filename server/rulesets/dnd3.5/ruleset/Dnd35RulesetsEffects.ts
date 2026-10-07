import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { RulesetFields, RulesetsEffects } from "@/server/rulesets/engine/module/index.ts";

import { RULESET_FIELD_PROPERTY_TYPES, toRulesetProperties } from "./rulesetFields.ts";

export class Dnd35RulesetsEffects implements RulesetsEffects {
  async syncProperties(tx: Db, rulesetId: string, fields: RulesetFields): Promise<void> {
    await Properties.delete(tx, {
      entityIds: [rulesetId],
      entityType: "rulesets",
      types: RULESET_FIELD_PROPERTY_TYPES,
    });

    const records = toRulesetProperties(rulesetId, fields);
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
