import { getEntity } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { Abilities } from "@/server/repositories/index.ts";

class AbilitiesService {
  async getAbilities(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { rulesetData } = scope;
      const { sourceChain } = rulesetData.cow;
      // Proxy auto-resolves FK fields on every returned row (and on paginated
      // results' `items`) so inherited ancestor rows land with post-COW ids.
      return await Abilities.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async getAbility(rulesetId: string, abilityId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const ability = getEntity(scope, "abilities", abilityId);
      return ability;
    });
  }
}

export default new AbilitiesService();
