import { getTableName } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { Activities, Feats, Klasses, Races, Rulesets, Skills } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { buildSourceChain } from "@/server/services/rulesets/cow/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

/** Publishing a ruleset: as one to fork, or as an extension. */
export function Publishes<B extends Constructor>(Base: B) {
  abstract class Publishing extends Base {
    protected assertCanBeExtension(ruleset: Pick<Ruleset, "rulesetId" | "extensionRulesetIds">) {
      if (!ruleset.rulesetId) {
        throw new UnprocessableEntityError("Only forks can be published as extensions");
      }
      if (ruleset.extensionRulesetIds.length > 0) {
        throw new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension");
      }
    }

    async publishRuleset(session: Session, id: string, body: { kind?: RulesetKind } = {}) {
      const result = await withTransaction(async (tx) => {
        // First verify the ruleset exists
        const ruleset = await Rulesets.findOne(tx, { id });
        if (!ruleset) {
          throw new NotFoundError("Ruleset not found");
        }

        new RulesetsPolicy(session, ruleset).canPublish();

        const targetKind = body.kind ?? ruleset.kind;
        if (targetKind === "extension") {
          this.assertCanBeExtension(ruleset);
        }

        // Extensions don't need playable content (races/klasses/skills/feats);
        // they're add-ons layered onto rulesets that already have the basics.
        if (targetKind !== "extension") {
          const sourceChain = buildSourceChain(ruleset);
          const races = await Races.findPage(
            tx,
            { rulesetId: id, ancestorRulesetIds: sourceChain, kind: "pc" },
            { limit: 1, page: 1 },
          );
          const klasses = await Klasses.findPage(
            tx,
            { rulesetId: id, ancestorRulesetIds: sourceChain, kind: "pc" },
            { limit: 1, page: 1 },
          );
          const skills = await Skills.findPage(
            tx,
            { rulesetId: id, ancestorRulesetIds: sourceChain },
            { limit: 1, page: 1 },
          );
          const feats = await Feats.findPage(
            tx,
            { rulesetId: id, ancestorRulesetIds: sourceChain },
            { limit: 1, page: 1 },
          );

          const missing: string[] = [];
          if (races.items.length === 0) missing.push("race");
          if (klasses.items.length === 0) missing.push("class");
          if (skills.items.length === 0) missing.push("skill");
          if (feats.items.length === 0) missing.push("feat");

          if (missing.length > 0) {
            throw new UnprocessableEntityError(`Ruleset requires at least one of each: ${missing.join(", ")}`);
          }
        }

        if (body.kind && body.kind !== ruleset.kind) {
          await Rulesets.update(tx, { kind: body.kind }, { id });
        }

        const rows = await Rulesets.publish(tx, { id });
        const publishedRuleset = rows[0];

        await Activities.create(tx, {
          userId: session.userId,
          targetId: publishedRuleset.id,
          targetTable: getTableName(rulesetsInRules),
          type: "publishRuleset",
        });

        return publishedRuleset;
      });

      invalidateRuleset(id);
      return result;
    }
  }
  return Publishing;
}
