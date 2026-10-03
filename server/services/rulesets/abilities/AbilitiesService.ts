import { db } from "@/server/database/index.ts";
import { Abilities } from "@/server/repositories/index.ts";
import { findScopedEntity, withRulesetScope } from "@/server/services/rulesets/cow/index.ts";

class AbilitiesService {
  async getRulesetAbilities(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      // Proxy auto-resolves FK fields on every returned row (and on paginated
      // results' `items`) so inherited ancestor rows land with post-COW ids.
      return await Abilities.findManyByRulesetId(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...where },
        pagination,
      );
    });
  }

  async getRulesetAbility(rulesetId: string, abilityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const ability = findScopedEntity(rulesetData.abilitiesById, abilityId, rulesetId, sourceChain, "Ability");
      return ability;
    });
  }
}

export default new AbilitiesService();
