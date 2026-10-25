import { getTableName } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { Engine, type EntityFieldValues } from "@/engine/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Activities } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

/** A ruleset's Settings: its own fields (3.5's skill points' ability), as its chain composes them, and their save. */
class RulesetSettingsService {
  /** The ruleset's Settings (`fields`, by name): its own, or those its chain holds, the fork's first. */
  async getSettings(rulesetId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => ({
      id: rulesetId,
      fields: Engine.for(scope).describeSettings(),
    }));
  }

  /**
   * A save of the ruleset's Settings (`body.fields`, those it changes), by who may edit its content: checked by its
   * rules, written as the ruleset's own stored values, which its chain's give way to, and recorded as the ruleset's
   * own update is. Answers the Settings it keeps, as `getSettings` does.
   */
  async updateSettings(session: Session, rulesetId: string, body: { fields?: EntityFieldValues }) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { fields, writes } = Engine.for(scope).planSettings(body);
          await writeEntityWrites(tx, scope, { entityId: ruleset.id, entityType: "rulesets" }, writes);
          await Activities.create(tx, {
            userId: session.userId,
            targetId: ruleset.id,
            targetTable: getTableName(rulesetsInRules),
            type: "updateRulesetSettings",
            data: { entityName: ruleset.name },
          });
          return { id: rulesetId, fields };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new RulesetSettingsService();
