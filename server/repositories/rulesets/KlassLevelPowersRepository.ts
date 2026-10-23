import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import StoredJoinRepository from "@/server/repositories/StoredJoinRepository.ts";
import type { KlassLevelPower } from "@/shared/relations.ts";

/** A class level's spells: those it grants, each through a list, free or not. */
class KlassLevelPowersRepository extends StoredJoinRepository<KlassLevelPower> {
  protected override readonly join = "klass_level_powers";

  async delete(db: Db, where: { klassLevelId: string }) {
    return await this.remove(
      db,
      this.branchWhere(["klassLevelId" in where && eq(this.column("klassLevelId"), where.klassLevelId)])!,
    );
  }

  /** Levels' grants. */
  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    if (where.klassLevelIds.length === 0) return [];
    return await this.rows(db, [inArray(this.column("klassLevelId"), where.klassLevelIds)]);
  }
}

export default KlassLevelPowersRepository;
