import { getTableName } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Rulesets } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** Archiving a ruleset, and bringing it back. */
export function Archives<B extends Constructor>(Base: B) {
  abstract class Archiving extends Base {
    async archiveRuleset(session: Session, id: string) {
      return await withTransaction(async (tx) => {
        const ruleset = await Rulesets.findOne(tx, { id });
        if (!ruleset) throw new NotFoundError("Ruleset not found");

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdate();

        // Archive only flips status='Archived'. Entities and overrides stay
        // live so any character or campaign still pointing here keeps
        // resolving its data; the ruleset just becomes read-only at the
        // editing surface.
        const rows = await Rulesets.archive(tx, { id });
        const archivedRuleset = rows[0];

        await Activities.create(tx, {
          userId: session.userId,
          targetId: archivedRuleset.id,
          targetTable: getTableName(rulesetsInRules),
          type: "archiveRuleset",
        });

        return archivedRuleset;
      });
    }

    async unarchiveRuleset(session: Session, id: string) {
      const result = await withTransaction(async (tx) => {
        const ruleset = await Rulesets.findOne(tx, { id });
        if (!ruleset) throw new NotFoundError("Ruleset not found");

        (await RulesetsPolicy.for(tx, session, ruleset)).canUnarchive();

        const rows = await Rulesets.unarchive(tx, { id });
        const unarchivedRuleset = rows[0];

        if (!unarchivedRuleset) throw new InternalError("Failed to unarchive ruleset");

        await Activities.create(tx, {
          userId: session.userId,
          targetId: unarchivedRuleset.id,
          targetTable: getTableName(rulesetsInRules),
          type: "unarchiveRuleset",
        });

        return unarchivedRuleset;
      });
      RulesetCache.invalidate(id);
      return result;
    }
  }
  return Archiving;
}
