import type { Db } from "@/server/database/index.ts";
import { UnprocessableEntityError } from "@/server/errors/index.ts";
import { Contributors } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

export async function getRulesetPolicy(db: Db, session: Session, ruleset: Ruleset) {
  let role = null;
  if (ruleset.userId && ruleset.userId !== session.userId) {
    role = await Contributors.findActiveRole(db, { userId: session.userId, rulesetId: ruleset.id });
  }
  return new RulesetsPolicy(session, ruleset, role);
}

// A ruleset is starrable iff it's a base (forkable) or an extension
// (subscribable). Regular forks meant for direct play aren't useful as
// bookmarks since you can neither fork nor subscribe to them.
export function isStarrable(ruleset: Pick<Ruleset, "rulesetId" | "status" | "private" | "kind">): boolean {
  if (ruleset.private) return false;
  if (ruleset.status !== "Published") return false;
  if (!ruleset.rulesetId) return true;
  return ruleset.kind === "extension";
}

export function assertCanBeExtension(ruleset: Pick<Ruleset, "rulesetId" | "extensionRulesetIds">) {
  if (!ruleset.rulesetId) {
    throw new UnprocessableEntityError("Only forks can be published as extensions");
  }
  if (ruleset.extensionRulesetIds.length > 0) {
    throw new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension");
  }
}
