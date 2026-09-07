import { and, count, desc, eq, exists, inArray, isNull, not, or, sql } from "drizzle-orm";

import { charactersInCharacter, contributorsInCharacter, playerCharactersInCampaign, racesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance, Visibility } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharactersRepository extends BaseRepository<typeof charactersInCharacter, CharacterInstance> {
  constructor() {
    super(charactersInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof charactersInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  /** Hard delete — bonded children are reconcile-managed, not user-archived. */
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof charactersInCharacter>>,
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

  async archive(db: Db, where: { id: string }) {
    const archived = await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
    if (archived.length > 0) {
      await db
        .update(this.table)
        .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(and(eq(this.table.parentCharacterId, where.id), isNull(this.table.deletedAt)));
    }
    return archived;
  }

  async findIdsByUserIds(db: Db, where: { userIds: string[] }) {
    if (where.userIds.length === 0) return [];
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .where(inArray(this.table.userId, where.userIds));
    return rows.map((r) => r.id);
  }

  async archiveAllForUser(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async unarchive(db: Db, where: { id: string }) {
    const unarchived = await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), not(isNull(this.table.deletedAt))))
      .returning();
    if (unarchived.length > 0) {
      await db
        .update(this.table)
        .set({ deletedAt: null, updatedAt: new Date().toISOString() })
        .where(and(eq(this.table.parentCharacterId, where.id), not(isNull(this.table.deletedAt))));
    }
    return unarchived;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByRaceId(db: Db, where: { raceId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(rulesetsInRules, and(
        eq(rulesetsInRules.id, this.table.rulesetId),
        or(
          eq(rulesetsInRules.id, where.rulesetId),
          sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
          sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
        ),
      ))
      .where(eq(this.table.raceId, where.raceId))
      .limit(1);
    return rows.length > 0;
  }

  async existsByRaceFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowRaceIds: string[] },
  ) {
    const raceCondition = where.shadowRaceIds.length > 0
      ? or(eq(racesInRules.rulesetId, where.extensionRulesetId), inArray(racesInRules.id, where.shadowRaceIds))
      : eq(racesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(racesInRules, eq(racesInRules.id, this.table.raceId))
      .where(and(eq(this.table.rulesetId, where.hostRulesetId), raceCondition))
      .limit(1);
    return rows.length > 0;
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | { id: string; userId: string }
      | { shareToken: string }
      | { parentCharacterId: string; kind: "familiar" | "animalcompanion" | "mount" },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    const isUserFacing = ("userId" in where) || ("shareToken" in where);
    return await db.query.charactersInCharacter.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "userId" in where && eq(this.table.userId, where.userId),
        "shareToken" in where && eq(this.table.shareToken, where.shareToken),
        "parentCharacterId" in where && eq(this.table.parentCharacterId, where.parentCharacterId),
        "kind" in where && eq(this.table.kind, where.kind),
        isUserFacing && eq(this.table.kind, "pc"),
        this.visibility(visibility),
      ]),
    });
  }

  async findOneEditable(db: Db, where: { id: string; userId: string }, visibility: Visibility = Visibility.UnarchivedOnly) {
    const rows = await db
      .select()
      .from(charactersInCharacter)
      .where(this.where([
        eq(charactersInCharacter.id, where.id),
        eq(charactersInCharacter.kind, "pc"),
        or(
          eq(charactersInCharacter.userId, where.userId),
          exists(
            db
              .select({ one: sql`1` })
              .from(contributorsInCharacter)
              .where(and(
                eq(contributorsInCharacter.characterId, charactersInCharacter.id),
                eq(contributorsInCharacter.userId, where.userId),
                eq(contributorsInCharacter.status, "Active"),
                isNull(contributorsInCharacter.deletedAt),
              )),
          ),
        )!,
        this.visibility(visibility),
      ]))
      .limit(1);
    return rows[0];
  }

  async findMany(
    db: Db,
    where: {
      userId: string;
      visibility?: Visibility;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      // "owner" → only characters this user owns; "contributor" → only
      // characters they contribute to. Default (undefined) returns both.
      accessRole?: "owner" | "contributor";
    },
    pagination: { limit: number; page: number },
  ) {
    const { visibility = Visibility.UnarchivedOnly, search, orderBy = "createdAt", orderDir = "desc", accessRole } = where;
    const searchConditions = this.search(search, [this.table.name, this.table.description]);

    const ownerCondition = eq(this.table.userId, where.userId);
    const contributorCondition = exists(
      db
        .select({ one: sql`1` })
        .from(contributorsInCharacter)
        .where(and(
          eq(contributorsInCharacter.characterId, this.table.id),
          eq(contributorsInCharacter.userId, where.userId),
          eq(contributorsInCharacter.status, "Active"),
          isNull(contributorsInCharacter.deletedAt),
        )),
    );
    const accessCondition = accessRole === "owner"
      ? ownerCondition
      : accessRole === "contributor"
      ? contributorCondition
      : or(ownerCondition, contributorCondition);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      const rows = await db
        .select({
          id: this.table.id,
          userId: this.table.userId,
          rulesetId: this.table.rulesetId,
          raceId: this.table.raceId,
          kind: this.table.kind,
          parentCharacterId: this.table.parentCharacterId,
          xp: this.table.xp,
          name: this.table.name,
          alignment: this.table.alignment,
          age: this.table.age,
          gender: this.table.gender,
          height: this.table.height,
          weight: this.table.weight,
          deity: this.table.deity,
          description: this.table.description,
          notes: this.table.notes,
          privateNotes: this.table.privateNotes,
          shareToken: this.table.shareToken,
          createdAt: this.table.createdAt,
          updatedAt: this.table.updatedAt,
          deletedAt: this.table.deletedAt,
          accessRole: sql<"owner" | "contributor">`CASE WHEN ${this.table.userId} = ${where.userId} THEN 'owner' ELSE 'contributor' END`,
        })
        .from(this.table)
        .where(this.where([
          accessCondition!,
          eq(this.table.kind, "pc"),
          this.visibility(visibility),
          searchConditions,
        ]))
        .orderBy(this.orderBy(this.table[orderBy], orderDir))
        .limit(limit)
        .offset(offset);
      return rows;
    });
  }

  async findUnlinked(
    db: Db,
    where: { userId: string; rulesetId: string; search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await this.withPagination(pagination, async ({ limit, offset }) => {
      const results = await db
        .select({
          id: charactersInCharacter.id,
          userId: charactersInCharacter.userId,
          rulesetId: charactersInCharacter.rulesetId,
          raceId: charactersInCharacter.raceId,
          kind: charactersInCharacter.kind,
          parentCharacterId: charactersInCharacter.parentCharacterId,
          xp: charactersInCharacter.xp,
          name: charactersInCharacter.name,
          alignment: charactersInCharacter.alignment,
          age: charactersInCharacter.age,
          gender: charactersInCharacter.gender,
          height: charactersInCharacter.height,
          weight: charactersInCharacter.weight,
          deity: charactersInCharacter.deity,
          description: charactersInCharacter.description,
          notes: charactersInCharacter.notes,
          privateNotes: charactersInCharacter.privateNotes,
          shareToken: charactersInCharacter.shareToken,
          createdAt: charactersInCharacter.createdAt,
          updatedAt: charactersInCharacter.updatedAt,
          deletedAt: charactersInCharacter.deletedAt,
        })
        .from(charactersInCharacter)
        .leftJoin(
          playerCharactersInCampaign,
          and(
            eq(playerCharactersInCampaign.characterId, charactersInCharacter.id),
            isNull(playerCharactersInCampaign.deletedAt),
          ),
        )
        .where(
          and(
            eq(charactersInCharacter.userId, where.userId),
            eq(charactersInCharacter.rulesetId, where.rulesetId),
            eq(charactersInCharacter.kind, "pc"),
            isNull(charactersInCharacter.deletedAt),
            isNull(playerCharactersInCampaign.characterId), // NOT linked
            this.search(where.search, [charactersInCharacter.name]) || undefined,
          ),
        )
        .orderBy(desc(charactersInCharacter.createdAt))
        .limit(limit)
        .offset(offset);

      return results;
    });
  }

  async count(db: Db, where: { userId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(charactersInCharacter)
      .where(and(
        isNull(charactersInCharacter.deletedAt),
        eq(charactersInCharacter.userId, where.userId),
        eq(charactersInCharacter.kind, "pc"),
      ));

    return result.count;
  }

  withInstance(instance: InferSelectModel<typeof charactersInCharacter>) {
    return new CharacterInstance(instance);
  }
}

class CharacterInstance extends Instance<InferSelectModel<typeof charactersInCharacter>> {}

export default CharactersRepository;
