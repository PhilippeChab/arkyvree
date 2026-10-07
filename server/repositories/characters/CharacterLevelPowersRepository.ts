import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import { aptitudesInRules, levelPowersInCharacter, powersInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

class CharacterLevelPowersRepository extends LevelPicksRepository<typeof levelPowersInCharacter> {
  constructor() {
    super(levelPowersInCharacter);
  }

  /**
   * Whether a character on the ruleset (or a descendant) picked the entity, or, with an extension, one of its entities:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { powerId: string; rulesetId: string }
      | { aptitudeId: string; rulesetId: string }
      | { hostRulesetId: string; extensionRulesetId: string; shadowPowerIds: string[] }
      | { hostRulesetId: string; extensionRulesetId: string; shadowAptitudeIds: string[] },
  ): Promise<boolean> {
    const { table } = this;
    if ("powerId" in where)
      return await this.existsPick(db, table.powerId, { id: where.powerId, rulesetId: where.rulesetId });
    if ("aptitudeId" in where)
      return await this.existsPick(db, table.aptitudeId, { id: where.aptitudeId, rulesetId: where.rulesetId });

    if ("shadowPowerIds" in where) {
      return await this.existsPickFromExtension(db, table.powerId, powersInRules, {
        ...where,
        shadowIds: where.shadowPowerIds,
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
      .leftJoin(powersInRules, eq(powersInRules.id, this.table.powerId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(powersInRules.name),
        this.orderBy(this.table.powerId),
        this.orderBy(this.table.aptitudeId),
        this.orderBy(this.table.characterLevelId),
      );
  }
}

export default CharacterLevelPowersRepository;
