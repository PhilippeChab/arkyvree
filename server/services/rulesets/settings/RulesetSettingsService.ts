import { Engine, type SettingsForm } from "@/engine/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Activities, RulesetSettings } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/** A ruleset's Settings: its own fields (3.5's skill points' ability), as its chain composes them, and their save. */
class RulesetSettingsService {
  /**
   * The ruleset's Settings (its fields by stored field, its links by role, as its form sends them): its own, or those
   * its chain holds, the fork's first.
   */
  async getSettings(rulesetId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => ({
      id: rulesetId,
      ...Engine.for(scope).describeSettings(),
    }));
  }

  /**
   * A save of the ruleset's Settings (`body`: its fields by stored field and its links by role, those it changes), by who
   * may edit its content: checked by its rules, written as the ruleset's own fields and links, which its chain's give
   * way to, and recorded as the ruleset's own update is. Answers the Settings it keeps, as `getSettings` does.
   */
  async updateSettings(session: Session, rulesetId: string, body: SettingsForm) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { write, ...settings } = Engine.for(scope).planSettings(body);
          await RulesetSettings.update(tx, [{ id: ruleset.id, write }]);
          await Activities.create(tx, {
            userId: session.userId,
            targetId: ruleset.id,
            targetType: TARGET_TYPES.rulesets,
            type: "updateRulesetSettings",
            data: { entityName: ruleset.name },
          });
          return { id: rulesetId, ...settings };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new RulesetSettingsService();
