import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import StoredJoinRepository from "@/server/repositories/StoredJoinRepository.ts";
import type { KlassSkill } from "@/shared/relations.ts";

/** A class's skills: those it takes as class skills. */
class KlassSkillsRepository extends StoredJoinRepository<KlassSkill> {
  protected override readonly join = "klass_skills";

  async delete(db: Db, where: { klassId: string; skillId: string }) {
    return await this.remove(
      db,
      this.branchWhere([
        "klassId" in where && eq(this.column("klassId"), where.klassId),
        "skillId" in where && eq(this.column("skillId"), where.skillId),
      ])!,
    );
  }

  async findMany(db: Db, where: { klassIds: string[] }) {
    if (where.klassIds.length === 0) return [];
    return await this.rows(db, [inArray(this.column("klassId"), where.klassIds)]);
  }
}

export default KlassSkillsRepository;
