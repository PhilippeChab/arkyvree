import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { contributorsInRules } from "@/drizzle/schema.ts";
import ContributionRepository from "@/server/repositories/ContributionRepository.ts";
import type { ContributorStatus } from "@/shared/enums.ts";

class ContributorsRepository extends ContributionRepository<typeof contributorsInRules, "rulesetId"> {
  constructor() {
    super(contributorsInRules, "rulesetId");
  }

  /**
   * A ruleset's contributors with `status`; a user's rows by id, whatever their status (`ids`: their invites a page
   * names); or a user's rows with `status` in some rulesets (`rulesetIds`: a page's).
   */
  async findMany(
    db: Db,
    where:
      | { ids: string[]; userId: string }
      | { rulesetId: string; status: ContributorStatus }
      | { rulesetIds: string[]; status: ContributorStatus; userId: string },
  ) {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("rulesetIds" in where && where.rulesetIds.length === 0) return [];
    return await db.query.contributorsInRules.findMany({
      where: this.branchWhere(
        [
          "ids" in where && inArray(this.table.id, where.ids),
          "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
          "rulesetIds" in where && inArray(this.table.rulesetId, where.rulesetIds),
        ],
        [
          "userId" in where && eq(this.table.userId, where.userId),
          "status" in where && eq(this.table.status, where.status),
        ],
      ),
    });
  }

  // Single invite for a specific user, any status. Caller is responsible for
  // scoping by userId so a stranger can't probe other people's invite ids.
  async findOneWithRuleset(db: Db, where: { id: string; userId: string }) {
    return await db.query.contributorsInRules.findFirst({
      where: this.where([eq(this.table.id, where.id), eq(this.table.userId, where.userId)]),
      with: {
        rulesetsInRule: {
          columns: { id: true, name: true, status: true },
        },
      },
    });
  }
}

export default ContributorsRepository;
