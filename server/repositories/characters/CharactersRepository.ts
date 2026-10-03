import { and, count, eq, exists, inArray, isNull, not, or, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import {
  charactersInCharacter,
  contributorsInCharacter,
  playerCharactersInCampaign,
  racesInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

class CharactersRepository extends include(
  BaseRepository<typeof charactersInCharacter>,
  Paginates,
  Searches,
  ChecksRulesetUse,
  ResolvesCopies,
  GuardsStaleEdits,
) {
  constructor() {
    super(charactersInCharacter);
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  private async existsRacePick(db: Db, where: { raceId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(this.table.rulesetId, where.rulesetId))
      .where(this.idMatches(this.table.raceId, where.raceId))
      .limit(1);
    return rows.length > 0;
  }

  private async existsRacePickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowRaceIds: string[] },
  ) {
    const raceCondition =
      where.shadowRaceIds.length > 0
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

  /** A character the user may edit: theirs, or one they contribute to. */
  private async findEditable(
    db: Db,
    where: { id: string; userId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    const rows = await db
      .select()
      .from(charactersInCharacter)
      .where(
        this.where([
          eq(charactersInCharacter.id, where.id),
          eq(charactersInCharacter.kind, "pc"),
          or(
            eq(charactersInCharacter.userId, where.userId),
            exists(
              db
                .select({ one: sql`1` })
                .from(contributorsInCharacter)
                .where(
                  and(
                    eq(contributorsInCharacter.characterId, charactersInCharacter.id),
                    eq(contributorsInCharacter.userId, where.userId),
                    eq(contributorsInCharacter.status, "Active"),
                    isNull(contributorsInCharacter.deletedAt),
                  ),
                ),
            ),
          )!,
          this.visibility(visibility),
        ]),
      )
      .limit(1);
    return rows[0];
  }

  async count(db: Db, where: { userId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(charactersInCharacter)
      .where(
        and(
          isNull(charactersInCharacter.deletedAt),
          eq(charactersInCharacter.userId, where.userId),
          eq(charactersInCharacter.kind, "pc"),
        ),
      );

    return result.count;
  }

  /**
   * Whether a character on the ruleset (or a descendant) is of the race, or, with an extension, of one of its races:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { raceId: string; rulesetId: string }
      | { hostRulesetId: string; extensionRulesetId: string; shadowRaceIds: string[] },
  ): Promise<boolean> {
    if ("raceId" in where) return await this.existsRacePick(db, where);
    return await this.existsRacePickFromExtension(db, where);
  }

  async findIds(db: Db, where: { userIds: string[] }) {
    if (where.userIds.length === 0) return [];
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .where(inArray(this.table.userId, where.userIds));
    return rows.map((r) => r.id);
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.charactersInCharacter.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
    });
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | { id: string; userId: string }
      | { shareToken: string }
      | { parentCharacterId: string; kind: "familiar" | "animalcompanion" | "mount" }
      | { id: string; editorId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    if ("editorId" in where) return await this.findEditable(db, { id: where.id, userId: where.editorId }, visibility);
    const isUserFacing = "userId" in where || "shareToken" in where;
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

  /** The user's characters, owned or contributed to. */
  async findPage(
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
    const {
      visibility = Visibility.UnarchivedOnly,
      search,
      orderBy = "createdAt",
      orderDir = "desc",
      accessRole,
    } = where;
    const searchConditions = this.search(search, [this.table.name, this.table.description]);

    const ownerCondition = eq(this.table.userId, where.userId);
    const contributorCondition = exists(
      db
        .select({ one: sql`1` })
        .from(contributorsInCharacter)
        .where(
          and(
            eq(contributorsInCharacter.characterId, this.table.id),
            eq(contributorsInCharacter.userId, where.userId),
            eq(contributorsInCharacter.status, "Active"),
            isNull(contributorsInCharacter.deletedAt),
          ),
        ),
    );
    const accessCondition =
      accessRole === "owner"
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
          accessRole: sql<
            "owner" | "contributor"
          >`CASE WHEN ${this.table.userId} = ${where.userId} THEN 'owner' ELSE 'contributor' END`,
        })
        .from(this.table)
        .where(this.where([accessCondition!, eq(this.table.kind, "pc"), this.visibility(visibility), searchConditions]))
        .orderBy(this.orderBy(this.table[orderBy], orderDir))
        .limit(limit)
        .offset(offset);
      return rows;
    });
  }

  /** The user's characters on the ruleset that no campaign links: what a campaign can link. */
  async findUnlinkedPage(
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
        .orderBy(this.orderBy(charactersInCharacter.createdAt, "desc"))
        .limit(limit)
        .offset(offset);

      return results;
    });
  }

  async create(db: Db, values: InferInsertModel<typeof charactersInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof charactersInCharacter>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        this.where([
          eq(this.table.id, where.id),
          isNull(this.table.deletedAt),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning();
  }

  /** Archives a character and its children (`{ id }`), or every character a user owns (`{ userId }`). */
  async archive(db: Db, where: { id: string } | { userId: string }) {
    const archived = await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        this.writeWhere(
          ["id" in where && eq(this.table.id, where.id), "userId" in where && eq(this.table.userId, where.userId)],
          [isNull(this.table.deletedAt)],
        ),
      )
      .returning();
    if ("id" in where && archived.length > 0) {
      await db
        .update(this.table)
        .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(and(eq(this.table.parentCharacterId, where.id), isNull(this.table.deletedAt)));
    }
    return archived;
  }

  /** Hard delete — bonded children are reconcile-managed, not user-archived. */
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
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
}

export default CharactersRepository;
