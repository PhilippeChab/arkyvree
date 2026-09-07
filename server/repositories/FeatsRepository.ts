import { and, asc, count, eq, getTableColumns, inArray, isNull, notInArray, sql } from "drizzle-orm";

import {
  featsAptitudesInRules,
  featsInRules,
  klassLevelFeatsInRules,
  klassLevelsInRules,
  levelFeatsInCharacter,
  levelsInCharacter,
  propertiesInCustomization,
} from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class FeatsRepository extends BaseRepository<typeof featsInRules, FeatInstance> {
  constructor() {
    super(featsInRules, "feats");
  }

  async create(db: Db, values: InferInsertModel<typeof featsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof featsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof featsInRules>>,
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
    throw new InternalError("feats don't soft-archive — use Feats.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(db: Db, where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string }) {
    return await db.query.featsInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
      with: {
        featsAptitudesInRules: {
          with: {
            aptitudesInRule: true,
          },
        },
      },
    });
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.featsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: (feats, { asc }) => [asc(feats.name)],
      with: {
        featsAptitudesInRules: {
          with: {
            aptitudesInRule: true,
          },
        },
      },
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; aptitudeId?: string; family?: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; aptitudeId?: string; family?: string; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const aptitudeCondition = where.aptitudeId
      ? inArray(this.table.id,
          db.select({ id: featsAptitudesInRules.featId })
            .from(featsAptitudesInRules)
            .where(eq(featsAptitudesInRules.aptitudeId, where.aptitudeId)),
        )
      : false;

    const familyCondition = where.family
      ? inArray(this.table.id,
          db.select({ id: propertiesInCustomization.entityId })
            .from(propertiesInCustomization)
            .where(and(
              eq(propertiesInCustomization.entityType, "feats"),
              eq(propertiesInCustomization.type, "FEAT_FAMILY"),
              eq(propertiesInCustomization.value, where.family),
              isNull(propertiesInCustomization.deletedAt),
            )),
        )
      : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.featsInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, aptitudeCondition, familyCondition]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        with: {
          featsAptitudesInRules: {
            with: {
              aptitudesInRule: true,
            },
          },
        },
        limit,
        offset,
      });
    });
  }

  async findManyGroupedByRulesetId(
    db: Db,
    where: { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; aptitudeId?: string; aptitudeIds?: string[]; excludeIds?: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { search } = where;
    const searchCondition = this.search(search, [this.table.name]);
    const { limit, offset } = this.paginate(pagination);

    const aptitudeCondition = where.aptitudeIds
      ? inArray(this.table.id,
          db.select({ id: featsAptitudesInRules.featId })
            .from(featsAptitudesInRules)
            .where(inArray(featsAptitudesInRules.aptitudeId, where.aptitudeIds)),
        )
      : where.aptitudeId
        ? inArray(this.table.id,
            db.select({ id: featsAptitudesInRules.featId })
              .from(featsAptitudesInRules)
              .where(eq(featsAptitudesInRules.aptitudeId, where.aptitudeId)),
          )
        : false;

    const excludeCondition = where.excludeIds && where.excludeIds.length > 0
      ? notInArray(this.table.id, where.excludeIds)
      : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);
    const prop = propertiesInCustomization;

    const rows = await db
      .select({
        displayName: sql<string>`coalesce(min(${prop.value}), min(${this.table.name}))`.as("display_name"),
        family: sql<string | null>`min(${prop.value})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${this.table.id}::text)`.as("representative_id"),
      })
      .from(this.table)
      .leftJoin(prop, and(
        eq(prop.entityId, this.table.id),
        eq(prop.entityType, "feats"),
        eq(prop.type, "FEAT_FAMILY"),
        isNull(prop.deletedAt),
      ))
      .where(this.where([rulesetCondition, isNull(this.table.deletedAt), searchCondition, aptitudeCondition, excludeCondition]))
      .groupBy(sql`coalesce(${prop.value}, ${this.table.id}::text)`)
      .orderBy(sql`coalesce(min(${prop.value}), min(${this.table.name}))`)
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findAvailableByAptitude(
    db: Db,
    where: { rulesetId: string; ancestorRulesetIds?: string[]; aptitudeId: string; excludeFeatIds?: string[]; siblingLoserIds?: Iterable<string>; family?: string; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { aptitudeId, excludeFeatIds, siblingLoserIds, family, search } = where;
    const searchCondition = this.search(search, [featsInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const familyCondition = family
      ? inArray(featsInRules.id,
          db.select({ id: propertiesInCustomization.entityId })
            .from(propertiesInCustomization)
            .where(and(
              eq(propertiesInCustomization.entityType, "feats"),
              eq(propertiesInCustomization.type, "FEAT_FAMILY"),
              eq(propertiesInCustomization.value, family),
              isNull(propertiesInCustomization.deletedAt),
            )),
        )
      : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const rows = await db
      .selectDistinctOn([featsInRules.name], { id: featsInRules.id, name: featsInRules.name, description: featsInRules.description })
      .from(featsInRules)
      .innerJoin(featsAptitudesInRules, eq(featsInRules.id, featsAptitudesInRules.featId))
      .where(
        this.where([
          rulesetCondition,
          isNull(featsInRules.deletedAt),
          isNull(featsInRules.campaignId),
          eq(featsAptitudesInRules.aptitudeId, aptitudeId),
          eq(featsInRules.selectable, true),
          searchCondition,
          familyCondition,
          this.excludeIds(excludeFeatIds),
          this.excludeIds(siblingLoserIds),
        ]),
      )
      .orderBy(asc(featsInRules.name))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findAvailableByAptitudeGrouped(
    db: Db,
    where: { rulesetId: string; ancestorRulesetIds?: string[]; aptitudeId: string; excludeFeatIds?: string[]; siblingLoserIds?: Iterable<string>; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { aptitudeId, excludeFeatIds, siblingLoserIds, search } = where;
    const searchCondition = this.search(search, [featsInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const prop = propertiesInCustomization;

    const rows = await db
      .select({
        displayName: sql<string>`CASE WHEN count(*) = 1 THEN min(${featsInRules.name}) ELSE coalesce(min(${prop.value}), min(${featsInRules.name})) END`.as("display_name"),
        family: sql<string | null>`min(${prop.value})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${featsInRules.id}::text)`.as("representative_id"),
        description: sql<string>`min(${featsInRules.description})`.as("description"),
      })
      .from(featsInRules)
      .innerJoin(featsAptitudesInRules, eq(featsInRules.id, featsAptitudesInRules.featId))
      .leftJoin(prop, and(
        eq(prop.entityId, featsInRules.id),
        eq(prop.entityType, "feats"),
        eq(prop.type, "FEAT_FAMILY"),
        isNull(prop.deletedAt),
        sql`${featsInRules.name} LIKE ${prop.value} || '%'`,
      ))
      .where(
        this.where([
          rulesetCondition,
          isNull(featsInRules.deletedAt),
          isNull(featsInRules.campaignId),
          eq(featsAptitudesInRules.aptitudeId, aptitudeId),
          eq(featsInRules.selectable, true),
          searchCondition,
          this.excludeIds(excludeFeatIds),
          this.excludeIds(siblingLoserIds),
        ]),
      )
      .groupBy(sql`coalesce(${prop.value}, ${featsInRules.id}::text)`)
      .orderBy(sql`coalesce(min(${prop.value}), min(${featsInRules.name}))`)
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findManyByCharacterLevelIds(db: Db, where: { characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(featsInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        aptitudeId: levelFeatsInCharacter.aptitudeId,
      })
      .from(featsInRules)
      .innerJoin(levelFeatsInCharacter, eq(featsInRules.id, levelFeatsInCharacter.featId))
      .innerJoin(
        levelsInCharacter,
        eq(levelFeatsInCharacter.characterLevelId, levelsInCharacter.id),
      )
      .innerJoin(klassLevelsInRules, eq(levelsInCharacter.klassLevelId, klassLevelsInRules.id))
      .where(
        and(
          inArray(levelFeatsInCharacter.characterLevelId, where.characterLevelIds),
          isNull(featsInRules.deletedAt),
        ),
      );
  }

  async findManyByKlassLevelIds(db: Db, where: { klassLevelIds: string[]; characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(featsInRules),
        klassLevelId: sql<string>`${klassLevelsInRules.id}`.as("klass_level_id"),
        characterLevelId: sql<string>`${levelsInCharacter.id}`.as("character_level_id"),
        aptitudeId: klassLevelFeatsInRules.aptitudeId,
        free: klassLevelFeatsInRules.free,
        klassLevelFeatId: sql<string>`${klassLevelFeatsInRules.id}`.as("klass_level_feat_id"),
      })
      .from(featsInRules)
      .innerJoin(klassLevelFeatsInRules, eq(featsInRules.id, klassLevelFeatsInRules.featId))
      .innerJoin(klassLevelsInRules, eq(klassLevelFeatsInRules.klassLevelId, klassLevelsInRules.id))
      .innerJoin(levelsInCharacter, eq(klassLevelsInRules.id, levelsInCharacter.klassLevelId))
      .where(
        and(
          inArray(klassLevelFeatsInRules.klassLevelId, where.klassLevelIds),
          inArray(levelsInCharacter.id, where.characterLevelIds),
          isNull(featsInRules.deletedAt),
        ),
      );
  }

  withInstance(instance: InferSelectModel<typeof featsInRules>) {
    return new FeatInstance(instance);
  }
}

class FeatInstance extends Instance<InferSelectModel<typeof featsInRules>> {}

export default FeatsRepository;
