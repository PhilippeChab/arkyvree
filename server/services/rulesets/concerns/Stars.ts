import { withTransaction } from "@/server/database/index.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { Rulesets, StarredRulesets } from "@/server/repositories/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

/** Starring a ruleset: a bookmark on a base or an extension. */
export function Stars<B extends Constructor>(Base: B) {
  abstract class Starring extends Base {
    // A ruleset is starrable iff it's a base (forkable) or an extension
    // (subscribable). Regular forks meant for direct play aren't useful as
    // bookmarks since you can neither fork nor subscribe to them.
    protected isStarrable(ruleset: Pick<Ruleset, "rulesetId" | "status" | "private" | "kind">): boolean {
      if (ruleset.private) return false;
      if (ruleset.status !== "Published") return false;
      if (!ruleset.rulesetId) return true;
      return ruleset.kind === "extension";
    }

    async starRuleset(session: Session, rulesetId: string) {
      return await withTransaction(async (tx) => {
        const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
        if (!ruleset) throw new NotFoundError("Ruleset not found");

        if (!this.isStarrable(ruleset)) throw new ForbiddenError("Only base rulesets and extensions can be starred");

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
