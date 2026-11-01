import type { Constructor } from "@/lib/mixins.ts";
import { InternalError } from "@/server/errors/index.ts";
import { Activities, Rulesets } from "@/server/repositories/index.ts";
import { withLockedRuleset } from "@/server/services/rulesets/rulesetWrites.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * Archiving a ruleset, and bringing it back (a draft): its status and its last change alone, which no cached view
 * reads (`RulesetViews` composes its entities), so neither drops one.
 */
export function Archives<B extends Constructor>(Base: B) {
  abstract class Archiving extends Base {
    async archiveRuleset(session: Session, id: string) {
      return await withLockedRuleset(session, id, async (tx, policy) => {
        policy.canUpdate();

        // Archive only flips status='Archived'. Entities and overrides stay
        // live so any character or campaign still pointing here keeps
        // resolving its data; the ruleset just becomes read-only at the
        // editing surface.
        const rows = await Rulesets.archive(tx, { id });
        const archivedRuleset = rows[0];

        if (!archivedRuleset) throw new InternalError("Failed to archive ruleset");

        await Activities.create(tx, {
          userId: session.userId,
          targetId: archivedRuleset.id,
          targetType: TARGET_TYPES.rulesets,
          type: "archiveRuleset",
        });

        return archivedRuleset;
      });
    }

    async unarchiveRuleset(session: Session, id: string) {
      return await withLockedRuleset(session, id, async (tx, policy) => {
        policy.canUnarchive();

        const rows = await Rulesets.unarchive(tx, { id });
        const unarchivedRuleset = rows[0];

        if (!unarchivedRuleset) throw new InternalError("Failed to unarchive ruleset");

        await Activities.create(tx, {
          userId: session.userId,
          targetId: unarchivedRuleset.id,
          targetType: TARGET_TYPES.rulesets,
          type: "unarchiveRuleset",
        });

        return unarchivedRuleset;
      });
    }
  }
  return Archiving;
}
