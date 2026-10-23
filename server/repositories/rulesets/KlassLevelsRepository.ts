import { eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import StoredKindRepository from "@/server/repositories/StoredKindRepository.ts";
import type { KlassLevel } from "@/shared/relations.ts";

/** A class's levels: entities its class owns, each at its level. */
class KlassLevelsRepository extends StoredKindRepository<KlassLevel> {
  protected override readonly entityType = "klass_levels";

  /** A class's levels, or several classes', by level. */
  async findMany(db: Db, where: { klassId: string } | { klassIds: string[] }) {
    if ("klassIds" in where && where.klassIds.length === 0) return [];
    return await this.rows(
      db,
      [
        this.branchWhere(
          [
            "klassId" in where && eq(entitiesInRules.ownerId, where.klassId),
            "klassIds" in where && inArray(entitiesInRules.ownerId, where.klassIds),
          ],
          [isNull(entitiesInRules.deletedAt)],
        ),
      ],
      [this.orderBy(this.column("level")), this.orderBy(this.column("klassId"))],
    );
  }

  /** A live class level, by id, of a class if `klassId` says. */
  async findOne(db: Db, where: { id: string } | { id: string; klassId: string }) {
    const [row] = await this.rows(db, [
      this.branchWhere(
        [eq(entitiesInRules.id, where.id)],
        ["klassId" in where && eq(entitiesInRules.ownerId, where.klassId), isNull(entitiesInRules.deletedAt)],
      ),
    ]);
    return row;
  }
}

export default KlassLevelsRepository;
