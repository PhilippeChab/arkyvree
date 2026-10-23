import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import StoredJoinRepository from "@/server/repositories/StoredJoinRepository.ts";
import type { KlassLevelSave } from "@/shared/relations.ts";

/** A class level's base save bonuses. */
class KlassLevelSavesRepository extends StoredJoinRepository<KlassLevelSave> {
  protected override readonly join = "klass_level_saves";

  async delete(db: Db, where: { klassLevelId: string }) {
    return await this.remove(
      db,
      this.branchWhere(["klassLevelId" in where && eq(this.column("klassLevelId"), where.klassLevelId)])!,
    );
  }

  async exists(db: Db, where: { saveId: string }) {
    return (await this.rows(db, [eq(this.column("saveId"), where.saveId)])).length > 0;
  }

  /** Levels' grants. */
  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    if (where.klassLevelIds.length === 0) return [];
    return await this.rows(db, [inArray(this.column("klassLevelId"), where.klassLevelIds)]);
  }
}

export default KlassLevelSavesRepository;
