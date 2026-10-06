import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import { aptitudesInRules, featsInRules, levelFeatsInCharacter } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import LevelPicksRepository from "@/server/repositories/characters/LevelPicksRepository.ts";

class CharacterLevelFeatsRepository extends LevelPicksRepository<typeof levelFeatsInCharacter> {
  constructor() {
    super(levelFeatsInCharacter);
  }

  /**
   * Whether a character on the ruleset (or a descendant) picked the entity, or, with an extension, one of its entities:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { featId: string; rulesetId: string }
      | { aptitudeId: string; rulesetId: string }
      | { hostRulesetId: string; extensionRulesetId: string; shadowFeatIds: string[] }
      | { hostRulesetId: string; extensionRulesetId: string; shadowAptitudeIds: string[] },
  ): Promise<boolean> {
    const { table } = this;
    if ("featId" in where)
      return await this.existsPick(db, table.featId, { id: where.featId, rulesetId: where.rulesetId });
    if ("aptitudeId" in where) {
      return await this.existsPick(db, table.aptitudeId, { id: where.aptitudeId, rulesetId: where.rulesetId });
    }
    if ("shadowFeatIds" in where) {
      return await this.existsPickFromExtension(db, table.featId, featsInRules, {
        ...where,
        shadowIds: where.shadowFeatIds,
      });
    }
    return await this.existsPickFromExtension(db, table.aptitudeId, aptitudesInRules, {
      ...where,
      shadowIds: where.shadowAptitudeIds,
    });
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .leftJoin(featsInRules, eq(featsInRules.id, this.table.featId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(featsInRules.name),
        this.orderBy(this.table.featId),
        this.orderBy(this.table.aptitudeId),
        this.orderBy(this.table.characterLevelId),
      );
  }
}

export default CharacterLevelFeatsRepository;
