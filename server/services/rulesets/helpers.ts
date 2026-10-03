import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { Db } from "@/server/database/index.ts";
import { UnprocessableEntityError } from "@/server/errors/index.ts";
import { Contributors, Powers } from "@/server/repositories/index.ts";
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

/** A page of the ruleset's powers, as its composed view has them. Called in the ruleset's scope. */
export async function findRulesetPowers(
  db: Db,
  rulesetData: CachedRulesetData,
  rulesetId: string,
  where: {
    childOnly?: boolean;
    aptitudeId?: string;
    level?: number;
    search?: string;
    orderBy?: "name" | "createdAt" | "updatedAt";
    orderDir?: "asc" | "desc";
  },
  pagination: { limit: number; page: number },
) {
  const { sourceChain, siblingIds } = rulesetData.cow;
  const result = await Powers.findManyByRulesetId(
    db,
    { rulesetId, ancestorRulesetIds: sourceChain, ...where },
    pagination,
  );
  // Filter sibling losers (if any) and replace each row's aptitude links
  // with the compose-step version (sibling-merged + FK-remapped). The
  // rest of the DB row (savesInRule join, etc.) is kept as-is.
  if (sourceChain.length > 0 && !where.childOnly) {
    const filtered = siblingIds.size > 0 ? result.items.filter((p) => !siblingIds.has(p.id)) : result.items;
    result.items = filtered.map((p) => {
      const merged = rulesetData.powersById.get(p.id);
      return merged ? { ...p, powersAptitudesInRules: merged.powersAptitudesInRules } : p;
    });
  }
  return result;
}
