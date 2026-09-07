import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import {
  klassLevelsInRules,
  levelsInCharacter,
  levelSkillsInCharacter,
  skillsInRules,
} from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class SkillsRepository extends BaseRepository<typeof skillsInRules, SkillInstance> {
  constructor() {
    super(skillsInRules, "skills");
  }

  async create(db: Db, values: InferInsertModel<typeof skillsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof skillsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof skillsInRules>>,
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
    throw new InternalError("skills don't soft-archive — use Skills.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string }) {
    return await db.query.skillsInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.skillsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (skills, { asc }) => [asc(skills.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.skillsInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async findManyByCharacterLevelIds(db: Db, where: { characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(skillsInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        rank: levelSkillsInCharacter.rank,
      })
      .from(skillsInRules)
      .innerJoin(levelSkillsInCharacter, eq(skillsInRules.id, levelSkillsInCharacter.skillId))
      .innerJoin(
        levelsInCharacter,
        eq(levelSkillsInCharacter.characterLevelId, levelsInCharacter.id),
      )
      .innerJoin(klassLevelsInRules, eq(levelsInCharacter.klassLevelId, klassLevelsInRules.id))
      .where(
        and(
          inArray(levelSkillsInCharacter.characterLevelId, where.characterLevelIds),
          isNull(skillsInRules.deletedAt),
        ),
      );
  }

  withInstance(instance: InferSelectModel<typeof skillsInRules>) {
    return new SkillInstance(instance);
  }
}

class SkillInstance extends Instance<InferSelectModel<typeof skillsInRules>> {}

export default SkillsRepository;
