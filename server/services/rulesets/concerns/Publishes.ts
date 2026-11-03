import type { Db } from "@/drizzle/database.ts";
import { Engine, type RulesetSources } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { Activities, Rulesets } from "@/server/repositories/index.ts";
import { withRulesetWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

/** Publishing a ruleset: as one to fork, or as an extension. */
export function Publishes<B extends Constructor>(Base: B) {
  abstract class Publishing extends Base {
    /**
     * What ruleset `id`'s kind check reads (`canTakeKind`), under a write's lock or for its `permissions`: whether it
     * subscribes to extensions (its `sources`, a write's scope's when it has one), and whether another ruleset
     * subscribes to it (`usedAsExtension`).
     */
    protected async readKindFacts(database: Db, id: string, sources?: RulesetSources) {
      const { extensionIds } = sources ?? (await Rulesets.findSources(database, { id }))!;
      return {
        hasExtensions: extensionIds.length > 0,
        usedAsExtension: await Rulesets.exists(database, { subscribedTo: id }),
      };
    }

    async publishRuleset(session: Session, id: string, body: { kind?: RulesetKind } = {}) {
      return await withRulesetWrite(session, id, async (tx, scope, policy) => {
        const { ruleset } = scope;
        const kind = body.kind ?? ruleset.kind;
        // Who, then its kind (by the extensions it subscribes to, its scope's `sources`), then its state
        policy.canPublish({ kind, ...(await this.readKindFacts(tx, id, scope.sources)) });
        // A playable ruleset's view gives what its rules make a character of
        Engine.for(scope).checkPublishable(kind);

        if (kind !== ruleset.kind) await Rulesets.update(tx, { kind }, { id });

        const rows = await Rulesets.publish(tx, { id });
        const publishedRuleset = rows[0];

        await Activities.create(tx, {
          userId: session.userId,
          targetId: publishedRuleset.id,
          targetType: TARGET_TYPES.rulesets,
          type: "publishRuleset",
        });

        return publishedRuleset;
      });
    }
  }
  return Publishing;
}
