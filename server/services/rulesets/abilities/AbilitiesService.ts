import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
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
      return await Abilities.findPage(db, { rulesetId, ...rulesetData.cow.listFilters, ...where }, pagination);
    });
  }

  async getAbility(rulesetId: string, abilityId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const ability = Engine.for(scope).entity("abilities", abilityId).get();
      return ability;
    });
  }
}

export default new AbilitiesService();
