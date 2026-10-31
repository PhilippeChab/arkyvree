import type { Constructor } from "@/lib/mixins.ts";
import { withTransaction } from "@/server/database/index.ts";
import { StarredRulesets } from "@/server/repositories/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import type { Session } from "@/shared/relations.ts";

/** Starring a ruleset: a bookmark on a base or an extension. */
export function Stars<B extends Constructor>(Base: B) {
  abstract class Starring extends Base {
    async starRuleset(session: Session, rulesetId: string) {
      return await withTransaction(async (tx) => {
        (await getReadableRuleset(tx, session, rulesetId)).policy.canStar();

        await StarredRulesets.upsert(tx, { userId: session.userId, rulesetId });
      });
    }

    async unstarRuleset(session: Session, rulesetId: string) {
      return await withTransaction(async (tx) => {
        await StarredRulesets.archive(tx, { userId: session.userId, rulesetId });
      });
    }
  }
  return Starring;
}
