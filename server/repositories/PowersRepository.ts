import { and, asc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import {
  powersAptitudesInRules,
  powersInRules,
  klassLevelPowersInRules,
  klassLevelsInRules,
  levelPowersInCharacter,
  levelsInCharacter,
  savesInRules,
} from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class PowersRepository extends BaseRepository<typeof powersInRules, PowerInstance> {
  constructor() {
    super(powersInRules, "powers");
  }

  async create(db: Db, values: InferInsertModel<typeof powersInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof powersInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof powersInRules>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ]))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("powers don't soft-archive — use Powers.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string }) {
    return await db.query.powersInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
      with: {
        powersAptitudesInRules: {
          with: {
            aptitudesInRule: true,
          },
        },
        savesInRule: true,
      },
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.powersInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (powers, { asc }) => [asc(powers.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; aptitudeId?: string; level?: number; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; aptitudeId?: string; level?: number; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const aptitudeLevelCondition = where.aptitudeId
      ? inArray(this.table.id,
          db.select({ id: powersAptitudesInRules.powerId })
            .from(powersAptitudesInRules)
            .where(and(
              eq(powersAptitudesInRules.aptitudeId, where.aptitudeId),
              where.level != null ? eq(powersAptitudesInRules.level, where.level) : undefined,
            )),
        )
      : where.level != null
        ? inArray(this.table.id,
            db.select({ id: powersAptitudesInRules.powerId })
              .from(powersAptitudesInRules)
              .where(eq(powersAptitudesInRules.level, where.level)),
          )
        : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.powersInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, aptitudeLevelCondition]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        with: {
          powersAptitudesInRules: {
            with: {
              aptitudesInRule: true,
            },
          },
          savesInRule: true,
        },
        limit,
        offset,
      });
    });
  }

  async findAvailableByAptitude(
    db: Db,
    where: { rulesetId: string; ancestorRulesetIds?: string[]; aptitudeId: string; excludePowerIds?: string[]; siblingLoserIds?: Iterable<string>; search?: string; powerLevel?: number },
    pagination: { limit: number; page: number },
  ) {
    const { aptitudeId, excludePowerIds, siblingLoserIds, search, powerLevel } = where;
    const searchCondition = this.search(search, [powersInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const rows = await db
      .selectDistinctOn([powersInRules.name], { id: powersInRules.id, name: powersInRules.name, description: powersInRules.description })
      .from(powersInRules)
      .innerJoin(powersAptitudesInRules, eq(powersInRules.id, powersAptitudesInRules.powerId))
      .where(
        this.where([
          rulesetCondition,
          isNull(powersInRules.deletedAt),
          isNull(powersInRules.campaignId),
          eq(powersAptitudesInRules.aptitudeId, aptitudeId),
          searchCondition,
          this.excludeIds(excludePowerIds),
          this.excludeIds(siblingLoserIds),
          ...(powerLevel != null
            ? [eq(powersAptitudesInRules.level, powerLevel)]
            : []),
        ]),
      )
      .orderBy(asc(powersInRules.name))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findManyByAptitudeIds(db: Db, where: { aptitudeIds: string[]; levels?: number[] }) {
    return await db
      .select({
        ...getTableColumns(powersInRules),
        aptitudeId: powersAptitudesInRules.aptitudeId,
        powerLevel: powersAptitudesInRules.level,
        saveName: savesInRules.name,
      })
      .from(powersInRules)
      .innerJoin(powersAptitudesInRules, eq(powersInRules.id, powersAptitudesInRules.powerId))
      .leftJoin(savesInRules, eq(powersInRules.saveId, savesInRules.id))
      .where(
        and(
          inArray(powersAptitudesInRules.aptitudeId, where.aptitudeIds),
          isNull(powersInRules.deletedAt),
          ...(where.levels && where.levels.length > 0
            ? [inArray(powersAptitudesInRules.level, where.levels)]
            : []),
        ),
      )
      .orderBy(asc(powersAptitudesInRules.level), asc(powersInRules.name));
  }

  async findManyByCharacterLevelIds(db: Db, where: { characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(powersInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        aptitudeId: levelPowersInCharacter.aptitudeId,
        saveName: savesInRules.name,
        powerLevel: powersAptitudesInRules.level,
      })
      .from(powersInRules)
      .innerJoin(levelPowersInCharacter, eq(powersInRules.id, levelPowersInCharacter.powerId))
      .innerJoin(
        levelsInCharacter,
        eq(levelPowersInCharacter.characterLevelId, levelsInCharacter.id),
      )
      .innerJoin(klassLevelsInRules, eq(levelsInCharacter.klassLevelId, klassLevelsInRules.id))
      .leftJoin(savesInRules, eq(powersInRules.saveId, savesInRules.id))
      .leftJoin(powersAptitudesInRules, and(
        eq(powersInRules.id, powersAptitudesInRules.powerId),
        eq(levelPowersInCharacter.aptitudeId, powersAptitudesInRules.aptitudeId),
      ))
      .where(
        and(
          inArray(levelPowersInCharacter.characterLevelId, where.characterLevelIds),
          isNull(powersInRules.deletedAt),
        ),
      );
  }

  async findManyByKlassLevelIds(db: Db, where: { klassLevelIds: string[]; characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(powersInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        aptitudeId: klassLevelPowersInRules.aptitudeId,
        free: klassLevelPowersInRules.free,
        saveName: savesInRules.name,
        powerLevel: powersAptitudesInRules.level,
      })
      .from(powersInRules)
      .innerJoin(klassLevelPowersInRules, eq(powersInRules.id, klassLevelPowersInRules.powerId))
      .innerJoin(klassLevelsInRules, eq(klassLevelPowersInRules.klassLevelId, klassLevelsInRules.id))
      .innerJoin(levelsInCharacter, eq(klassLevelsInRules.id, levelsInCharacter.klassLevelId))
      .leftJoin(savesInRules, eq(powersInRules.saveId, savesInRules.id))
      .leftJoin(powersAptitudesInRules, and(
        eq(powersInRules.id, powersAptitudesInRules.powerId),
        eq(klassLevelPowersInRules.aptitudeId, powersAptitudesInRules.aptitudeId),
      ))
      .where(
        and(
          inArray(klassLevelPowersInRules.klassLevelId, where.klassLevelIds),
          inArray(levelsInCharacter.id, where.characterLevelIds),
          isNull(powersInRules.deletedAt),
        ),
      );
  }

  withInstance(instance: InferSelectModel<typeof powersInRules>) {
    return new PowerInstance(instance);
  }
}

class PowerInstance extends Instance<InferSelectModel<typeof powersInRules>> {}

export default PowersRepository;
