import { and, count, eq, exists, inArray, isNull, not, or, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter, contributorsInCharacter, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import StoredCharacters, { type CharacterValuesWrite } from "@/server/repositories/stored/StoredCharacters.ts";
import type { Character } from "@/shared/relations.ts";

/** A character's row as a write gives it: its own columns, and its fields' values and single links' entities it sets. */
type CharacterValues = Partial<typeof charactersInCharacter.$inferInsert> & CharacterValuesWrite;

/**
 * The characters: each one's row as stored, with its fields' values and its single links (`StoredCharacters`: 3.5's
 * race, alignment, XP).
 */
class CharactersRepository extends include(
  BaseRepository<typeof charactersInCharacter>,
  GuardsStaleEdits,
  Paginates,
  Searches,
) {
  constructor() {
    super(charactersInCharacter);
  }

  /** The condition that a user actively contributes to the character. */
  private contributesTo(db: Db, userId: string) {
    return exists(
      db
        .select({ one: sql`1` })
        .from(contributorsInCharacter)
        .where(
          and(
            eq(contributorsInCharacter.characterId, charactersInCharacter.id),
            eq(contributorsInCharacter.userId, userId),
            eq(contributorsInCharacter.status, "Active"),
          ),
        ),
    );
  }

  /** The characters a condition picks, each with its stored columns, in `order`, a page of them if `page` says. */
  private async rows(
    db: Db,
    where: SQL | undefined,
    order: SQL[] = [this.orderBy(charactersInCharacter.id)],
    page?: { limit: number; offset: number },
  ): Promise<Character[]> {
    const query = db
      .select(StoredCharacters.buildColumns())
      .from(charactersInCharacter)
      .where(where)
      .orderBy(...order);
    const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;
    return rows.map((row) => StoredCharacters.toCharacter(row));
  }

  /** Archives a character and its children (`{ id }`), or every character a user owns (`{ userId }`). */
  async archive(db: Db, where: { id: string } | { userId: string }) {
    const archived = await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        this.branchWhere(
          ["id" in where && eq(this.table.id, where.id), "userId" in where && eq(this.table.userId, where.userId)],
          [isNull(this.table.deletedAt)],
        ),
      )
      .returning({ id: this.table.id });
    if (archived.length === 0) return [];
    if ("id" in where) {
      await db
        .update(this.table)
        .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(and(eq(this.table.parentCharacterId, where.id), isNull(this.table.deletedAt)));
    }
    return await this.rows(
      db,
      inArray(
        this.table.id,
        archived.map((row) => row.id),
      ),
    );
  }

  async count(db: Db, where: { userId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(charactersInCharacter)
      .where(
        and(
          isNull(charactersInCharacter.deletedAt),
          eq(charactersInCharacter.userId, where.userId),
          inArray(charactersInCharacter.kind, [...Engine.storage().playerKinds()]),
        ),
      );
    return result.count;
  }

  /**
   * Writes a new character: its row, its fields' values (one always written it gives none of, its default) and its
   * single links.
   */
  async create(db: Db, values: CharacterValues & Pick<Character, "kind" | "name" | "rulesetId" | "userId">) {
    const { fields, links, ...own } = values;
    const [created] = await db.insert(this.table).values(own).returning({ id: this.table.id });
    await StoredCharacters.write(db, [created.id], { fields, links }, true);
    return await this.rows(db, eq(this.table.id, created.id));
  }

  /**
   * Hard delete — children follow their parent's levels (3.5's bonded creatures, `BondedPlans`), never archived by a
   * user.
   */
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  /**
   * Whether the user may edit a character built on the ruleset (`{ editorId, rulesetId }`: theirs, or one they actively
   * contribute to), archived or not, whose sheet stays readable: what lets them read a private ruleset.
   */
  async exists(db: Db, where: { editorId: string; rulesetId: string }) {
    const [row] = await db
      .select({ one: sql`1` })
      .from(charactersInCharacter)
      .where(
        and(
          eq(charactersInCharacter.rulesetId, where.rulesetId),
          inArray(charactersInCharacter.kind, [...Engine.storage().playerKinds()]),
          or(eq(charactersInCharacter.userId, where.editorId), this.contributesTo(db, where.editorId)),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findIds(db: Db, where: { userIds: string[] }) {
    if (where.userIds.length === 0) return [];
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .where(inArray(this.table.userId, where.userIds));
    return rows.map((r) => r.id);
  }

  /** Characters by id, or a parent's children (`parentCharacterId`: 3.5's bonded creatures). */
  async findMany(
    db: Db,
    where: { ids: string[] } | { parentCharacterId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    if ("ids" in where && where.ids.length === 0) return [];
    return await this.rows(
      db,
      this.branchWhere(
        [
          "ids" in where && inArray(this.table.id, where.ids),
          "parentCharacterId" in where && eq(this.table.parentCharacterId, where.parentCharacterId),
        ],
        [this.visibility(visibility)],
      ),
      [this.orderBy(this.table.createdAt), this.orderBy(this.table.id)],
    );
  }

  /**
   * A character by id, or its owner's (`{ id, userId }`); by share token; or a character's child (3.5's bonded
   * creature). Who may edit one is its policy's (`CharactersPolicy`).
   */
  async findOne(
    db: Db,
    where:
      | { id: string }
      | { id: string; userId: string }
      | { shareToken: string }
      | { kind: string; parentCharacterId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    const isUserFacing = "userId" in where || "shareToken" in where;
    const [row] = await this.rows(
      db,
      this.branchWhere(
        [
          "id" in where && eq(this.table.id, where.id),
          "shareToken" in where && eq(this.table.shareToken, where.shareToken),
          "parentCharacterId" in where && eq(this.table.parentCharacterId, where.parentCharacterId),
        ],
        [
          "userId" in where && eq(this.table.userId, where.userId),
          "kind" in where && eq(this.table.kind, where.kind),
          isUserFacing && inArray(this.table.kind, [...Engine.storage().playerKinds()]),
          this.visibility(visibility),
        ],
      ),
    );
    return row;
  }

  /**
   * The user's characters, owned or contributed to: the last changed first (`lastChangedAt`, which every change to a
   * character or its rows moves), unless the list says another order.
   */
  async findPage(
    db: Db,
    where: {
      // "owner" → only characters this user owns; "contributor" → only
      // characters they contribute to. Default (undefined) returns both.
      accessRole?: "owner" | "contributor";
      orderBy?: "name" | "createdAt" | "lastChangedAt";
      orderDir?: "asc" | "desc";
      search?: string;
      userId: string;
      visibility?: Visibility;
    },
    pagination: Pagination,
  ) {
    const {
      visibility = Visibility.UnarchivedOnly,
      search,
      orderBy = "lastChangedAt",
      orderDir = "desc",
      accessRole,
    } = where;
    const searchConditions = this.search(search, [this.table.name, this.table.description]);

    const ownerCondition = eq(this.table.userId, where.userId);
    const contributorCondition = this.contributesTo(db, where.userId);
    const accessCondition =
      accessRole === "owner"
        ? ownerCondition
        : accessRole === "contributor"
          ? contributorCondition
          : or(ownerCondition, contributorCondition);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      const rows = await db
        .select({
          ...StoredCharacters.buildColumns(),
          accessRole: sql<
            "owner" | "contributor"
          >`CASE WHEN ${this.table.userId} = ${where.userId} THEN 'owner' ELSE 'contributor' END`,
        })
        .from(this.table)
        .where(
          this.where([
            accessCondition!,
            inArray(this.table.kind, [...Engine.storage().playerKinds()]),
            this.visibility(visibility),
            searchConditions,
          ]),
        )
        .orderBy(...this.pageOrder(this.orderBy(this.table[orderBy], orderDir)))
        .limit(limit)
        .offset(offset);
      return rows.map((row) => StoredCharacters.toCharacter(row));
    });
  }

  /** The user's characters on the ruleset that no campaign links: what a campaign can link. */
  async findUnlinkedPage(
    db: Db,
    where: { rulesetId: string; search?: string; userId: string },
    pagination: Pagination,
  ) {
    return await this.withPagination(pagination, async ({ limit, offset }) => {
      const results = await db
        .select(StoredCharacters.buildColumns())
        .from(charactersInCharacter)
        .leftJoin(playerCharactersInCampaign, eq(playerCharactersInCampaign.characterId, charactersInCharacter.id))
        .where(
          and(
            eq(charactersInCharacter.userId, where.userId),
            eq(charactersInCharacter.rulesetId, where.rulesetId),
            inArray(charactersInCharacter.kind, [...Engine.storage().playerKinds()]),
            isNull(charactersInCharacter.deletedAt),
            isNull(playerCharactersInCampaign.characterId), // NOT linked
            this.search(where.search, [charactersInCharacter.name]) || undefined,
          ),
        )
        .orderBy(...this.pageOrder(this.orderBy(charactersInCharacter.createdAt, "desc")))
        .limit(limit)
        .offset(offset);

      return results.map((row) => StoredCharacters.toCharacter(row));
    });
  }

  async unarchive(db: Db, where: { id: string }) {
    const unarchived = await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), not(isNull(this.table.deletedAt))))
      .returning({ id: this.table.id });
    if (unarchived.length === 0) return [];
    await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.parentCharacterId, where.id), not(isNull(this.table.deletedAt))));
    return await this.rows(db, eq(this.table.id, where.id));
  }

  /**
   * Writes a change to a live character (`values`), if it's still the version the editor read (`expectedUpdatedAt`):
   * its row's columns, its fields' values and its single links it gives, its `updatedAt` moved as any change moves it.
   * Answers it as written, or nothing.
   */
  async update(db: Db, values: CharacterValues, where: { expectedUpdatedAt?: string; id: string }) {
    const { fields, links, ...own } = values;
    const updated = await db
      .update(this.table)
      .set({ ...own, updatedAt: new Date().toISOString() })
      .where(
        this.where([
          eq(this.table.id, where.id),
          isNull(this.table.deletedAt),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning({ id: this.table.id });
    const ids = updated.map((row) => row.id);
    await StoredCharacters.write(db, ids, { fields, links });
    return ids.length === 0 ? [] : await this.rows(db, inArray(this.table.id, ids));
  }
}

export default CharactersRepository;
