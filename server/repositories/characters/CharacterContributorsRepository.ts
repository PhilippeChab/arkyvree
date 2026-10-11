import { and, eq, inArray, type InferInsertModel, isNull, not, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { contributorsInCharacter, usersInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import type { ContributorStatus } from "@/server/repositories/rulesets/ContributorsRepository.ts";
import type { ContributorRole } from "@/shared/enums.ts";

class CharacterContributorsRepository extends include(
  BaseRepository<typeof contributorsInCharacter>,
  Paginates,
  Searches,
) {
  constructor() {
    super(contributorsInCharacter);
  }

  async backfillUserId(db: Db, email: string, userId: string) {
    return await db
      .update(this.table)
      .set({ userId, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.email, email),
          eq(this.table.status, "Pending"),
          isNull(this.table.userId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async create(
    db: Db,
    values: {
      characterId: string;
      email: string;
      invitedBy: string;
      role: ContributorRole;
      userId?: string;
    },
  ) {
    return await db
      .insert(this.table)
      .values({
        characterId: values.characterId,
        email: values.email,
        role: values.role,
        invitedBy: values.invitedBy,
        userId: values.userId,
      })
      .returning();
  }

  /** The user's contributions with `status` to any of the characters: one query for a list of characters. */
  async findMany(db: Db, where: { characterIds: string[]; status: ContributorStatus; userId: string }) {
    if (where.characterIds.length === 0) return [];
    return await db.query.contributorsInCharacter.findMany({
      where: this.where([
        inArray(this.table.characterId, where.characterIds),
        eq(this.table.userId, where.userId),
        eq(this.table.status, where.status),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findManyWithCharacter(
    db: Db,
    where: { status: ContributorStatus; userId: string },
    pagination: { limit: number } = { limit: 100 },
  ) {
    return await db.query.contributorsInCharacter.findMany({
      where: this.where([
        eq(this.table.userId, where.userId),
        eq(this.table.status, where.status),
        isNull(this.table.deletedAt),
      ]),
      with: {
        charactersInCharacter: {
          columns: { id: true, name: true },
        },
      },
      orderBy: [this.orderBy(this.table.createdAt, "desc")],
      limit: pagination.limit,
    });
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | { characterId: string; status: ContributorStatus; userId: string }
      | { characterId: string; email: string; status: ContributorStatus },
  ) {
    return await db.query.contributorsInCharacter.findFirst({
      where: this.branchWhere(
        [
          "id" in where && eq(this.table.id, where.id),
          "userId" in where && eq(this.table.userId, where.userId),
          "email" in where && eq(this.table.email, where.email),
        ],
        [
          "characterId" in where && eq(this.table.characterId, where.characterId),
          "status" in where && eq(this.table.status, where.status),
          isNull(this.table.deletedAt),
        ],
      ),
    });
  }

  // Single invite for a specific user, any status. Caller is responsible for
  // scoping by userId so a stranger can't probe other people's invite ids.
  async findOneWithCharacter(db: Db, where: { id: string; userId: string }) {
    return await db.query.contributorsInCharacter.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        eq(this.table.userId, where.userId),
        isNull(this.table.deletedAt),
      ]),
      with: {
        charactersInCharacter: {
          columns: { id: true, name: true, deletedAt: true },
        },
      },
    });
  }

  async findPage(
    db: Db,
    where: { characterId: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;
    const { limit, offset } = this.paginate(pagination);

    const searchCondition = search
      ? or(
          this.search(search, [this.table.email]) || undefined,
          this.search(search, [usersInAccount.username, usersInAccount.emailAddress]) || undefined,
        )
      : undefined;

    const rows = await db
      .select({
        contributor: this.table,
        user: {
          id: usersInAccount.id,
          username: usersInAccount.username,
          emailAddress: usersInAccount.emailAddress,
        },
      })
      .from(this.table)
      .leftJoin(usersInAccount, and(eq(this.table.userId, usersInAccount.id), isNull(usersInAccount.deletedAt)))
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          isNull(this.table.deletedAt),
          not(eq(this.table.status, "Revoked")),
          not(eq(this.table.status, "Rejected")),
          searchCondition,
        ),
      )
      .orderBy(...this.pageOrder(this.orderBy(this.table[orderBy], orderDir)))
      .limit(limit)
      .offset(offset);

    const items = rows.map((row) => ({
      ...row.contributor,
      user: row.user,
    }));

    return this.paginated(items, pagination);
  }

  /** The user's role on the character, when they're an active contributor. */
  async findRole(db: Db, where: { characterId: string; userId: string }): Promise<ContributorRole | undefined> {
    const contributor = await db.query.contributorsInCharacter.findFirst({
      where: this.where([
        eq(this.table.userId, where.userId),
        eq(this.table.characterId, where.characterId),
        eq(this.table.status, "Active"),
        isNull(this.table.deletedAt),
      ]),
    });

    return contributor?.role;
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof contributorsInCharacter>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }
}

export default CharacterContributorsRepository;
