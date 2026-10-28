import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { type RulesetScope, RulesetViews } from "@/server/cow/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { Activities, Rulesets } from "@/server/repositories/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

/** Publishing a ruleset: as one to fork, or as an extension. */
export function Publishes<B extends Constructor>(Base: B) {
  abstract class Publishing extends Base {
    /**
     * Refuses publishing the ruleset in `scope` as `kind`, which the publish and an edit of a published ruleset's kind
     * both ask: an extension must be one its policy says it can be (`policy.canBeExtension`), and a playable ruleset's
     * view must give what its rules make a character of (`checkPublishable`).
     */
    protected checkKind(scope: RulesetScope, policy: RulesetsPolicy, kind: RulesetKind) {
      if (kind === "extension") policy.canBeExtension();
      Engine.for(scope).checkPublishable(kind);
    }

    async publishRuleset(session: Session, id: string, body: { kind?: RulesetKind } = {}) {
      const result = await withTransaction(
        async (tx) =>
          await withReadableRuleset(tx, session, id, async (scope, policy) => {
            const { ruleset } = scope;
            policy.canPublish();

            this.checkKind(scope, policy, body.kind ?? ruleset.kind);

            if (body.kind && body.kind !== ruleset.kind) await Rulesets.update(tx, { kind: body.kind }, { id });

            const rows = await Rulesets.publish(tx, { id });
            const publishedRuleset = rows[0];

            await Activities.create(tx, {
              userId: session.userId,
              targetId: publishedRuleset.id,
              targetType: TARGET_TYPES.rulesets,
              type: "publishRuleset",
            });

            return publishedRuleset;
          }),
      );

      RulesetViews.invalidate(id);
      return result;
    }
  }
  return Publishing;
}
