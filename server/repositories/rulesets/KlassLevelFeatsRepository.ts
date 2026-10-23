import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import StoredJoinRepository from "@/server/repositories/StoredJoinRepository.ts";
import type { KlassLevelFeat } from "@/shared/relations.ts";

/** A class level's feats: those it grants, each through a pool, free or not. */
class KlassLevelFeatsRepository extends StoredJoinRepository<KlassLevelFeat> {
  protected override readonly join = "klass_level_feats";

  async delete(db: Db, where: { klassLevelId: string }) {
    return await this.remove(db, eq(this.column("klassLevelId"), where.klassLevelId));
  }

  /** Levels' grants. */
  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    if (where.klassLevelIds.length === 0) return [];
    return await this.rows(db, [inArray(this.column("klassLevelId"), where.klassLevelIds)]);
  }
}

export default KlassLevelFeatsRepository;
