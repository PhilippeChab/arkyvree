import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import StoredJoinRepository from "@/server/repositories/StoredJoinRepository.ts";
import type { FeatWithAptitudes } from "@/shared/relations.ts";

type FeatAptitude = Omit<FeatWithAptitudes["featsAptitudesInRules"][number], "aptitudesInRule">;

/** A feat's pools: the aptitudes it's listed in. */
class FeatsAptitudesRepository extends StoredJoinRepository<FeatAptitude> {
  protected override readonly join = "feats_aptitudes";

  async delete(db: Db, where: { featId: string }) {
    return await this.remove(db, this.branchWhere(["featId" in where && eq(this.column("featId"), where.featId)])!);
  }

  /** Links of feats. */
  async findMany(db: Db, where: { featIds: string[] } | { featId: string }) {
    if ("featIds" in where && where.featIds.length === 0) return [];
    return await this.rows(db, [
      this.branchWhere([
        "featIds" in where && inArray(this.column("featId"), where.featIds),
        "featId" in where && eq(this.column("featId"), where.featId),
      ])!,
    ]);
  }
}

export default FeatsAptitudesRepository;
