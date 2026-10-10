import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { aptitudesInRules, featsInRules, levelFeatsInCharacter } from "@/drizzle/schema.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

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
      | { featIds: string[]; rulesetId: string }
      | { aptitudeIds: string[]; rulesetId: string }
      | { extensionRulesetId: string; hostRulesetId: string; shadowFeatIds: string[] }
      | { extensionRulesetId: string; hostRulesetId: string; shadowAptitudeIds: string[] },
  ): Promise<boolean> {
    const { table } = this;
    if ("featIds" in where)
      return await this.existsPick(db, table.featId, { ids: where.featIds, rulesetId: where.rulesetId });
    if ("aptitudeIds" in where)
      return await this.existsPick(db, table.aptitudeId, { ids: where.aptitudeIds, rulesetId: where.rulesetId });

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

  /**
   * The picks of these character levels, by the picked entity's name, ties broken to a fixed order: a stackable feat a
   * level picked twice, by its rows' own ids.
   */
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
        this.orderBy(this.table.id),
      );
  }
}

export default CharacterLevelFeatsRepository;
