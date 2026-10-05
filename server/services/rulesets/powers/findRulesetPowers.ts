import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Powers } from "@/server/repositories/index.ts";
import { getListPowerIds } from "@/server/services/rulesets/aptitudes/index.ts";

/**
 * A page of the ruleset's powers, as its composed view has them: a list's (at a level), or those at a level on any list,
 * as the ruleset composes the lists. Called in the ruleset's scope.
 */
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
  const { aptitudeId, level, ...filters } = where;
  const ids =
    aptitudeId !== undefined || level != null ? getListPowerIds(rulesetData, { aptitudeId, level }) : undefined;
  const result = await Powers.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...filters, ids }, pagination);
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
