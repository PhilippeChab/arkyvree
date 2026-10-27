import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { UnprocessableEntityError } from "@/server/errors/index.ts";
import { Activities, Rulesets } from "@/server/repositories/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

/** Publishing a ruleset: as one to fork, or as an extension. */
export function Publishes<B extends Constructor>(Base: B) {
  abstract class Publishing extends Base {
    protected assertCanBeExtension(ruleset: Pick<Ruleset, "rulesetId" | "extensionRulesetIds">) {
      if (!ruleset.rulesetId) throw new UnprocessableEntityError("Only forks can be published as extensions");

      if (ruleset.extensionRulesetIds.length > 0)
        throw new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension");
    }

    async publishRuleset(session: Session, id: string, body: { kind?: RulesetKind } = {}) {
      const result = await withTransaction(
        async (tx) =>
          await withReadableRuleset(tx, session, id, async (scope, policy) => {
            const { ruleset } = scope;
            policy.canPublish();

            const targetKind = body.kind ?? ruleset.kind;
            if (targetKind === "extension") this.assertCanBeExtension(ruleset);
            Engine.for(scope).checkPublishable(targetKind);

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
