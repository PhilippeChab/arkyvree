import { eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { Race } from "@/shared/relations.ts";

/** The races: a ruleset's list of them, of a kind (a player character's, a bonded creature's) if one is given. */
class RacesRepository extends RulesetEntityRepository<Race> {
  protected override readonly entityType = "races";

  override async findPage(
    db: Db,
    where: RulesetEntityFilters<{ kind?: string }>,
    pagination: { limit: number; page: number },
  ) {
    return await super.findPage(db, where, pagination, [where.kind !== undefined && eq(this.column("kind"), where.kind)]);
  }
}

export default RacesRepository;
