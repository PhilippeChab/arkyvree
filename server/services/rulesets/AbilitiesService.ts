import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Abilities } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";

export const AbilitiesMethods = {
  async getRulesetAbilities(
    rulesetId: string,
    where: { childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      // Proxy auto-resolves FK fields on every returned row (and on paginated
      // results' `items`) so inherited ancestor rows land with post-COW ids.
      return await Abilities.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  },

  async getRulesetAbility(rulesetId: string, abilityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const ability = rulesetData.abilitiesById.get(abilityId);
      if (!ability || (ability.rulesetId !== rulesetId && !sourceChain.includes(ability.rulesetId))) {
        throw new NotFoundError("Ability not found in this ruleset");
      }
      return ability;
    });
  },
} as const;

class AbilitiesService extends BaseService<typeof AbilitiesMethods> {
  static initialize() {
    return new AbilitiesService(AbilitiesMethods);
  }
}

export default AbilitiesService;
