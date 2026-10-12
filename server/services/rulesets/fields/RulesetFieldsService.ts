import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";

/** The fields a ruleset's forms show, as its rules declare them: each entity's, and its Settings'. */
class RulesetFieldsService {
  /** Each entity type's form's fields, and the ruleset's Settings' (`rulesets`): their labels, inputs and options. */
  async getFields(rulesetId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).describeFields());
  }
}

export default new RulesetFieldsService();
