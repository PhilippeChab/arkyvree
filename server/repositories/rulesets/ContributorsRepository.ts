import { eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { contributorsInRules } from "@/drizzle/schema.ts";
import ContributionRepository from "@/server/repositories/ContributionRepository.ts";
import type { ContributorStatus } from "@/shared/enums.ts";

class ContributorsRepository extends ContributionRepository<typeof contributorsInRules, "rulesetId"> {
  constructor() {
    super(contributorsInRules, "rulesetId");
  }

  async findMany(db: Db, where: { rulesetId: string; status: ContributorStatus }) {
    return await db.query.contributorsInRules.findMany({
      where: this.where([eq(this.table.rulesetId, where.rulesetId), eq(this.table.status, where.status)]),
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
