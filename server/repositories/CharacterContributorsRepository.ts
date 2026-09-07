import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, eq, isNull, not, or } from "drizzle-orm";

import { contributorsInCharacter, usersInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

class CharacterContributorsRepository extends BaseRepository<typeof contributorsInCharacter, CharacterContributorInstance> {
  constructor() {
    super(contributorsInCharacter);
  }

  async create(db: Db, values: {
    characterId: string;
    email: string;
    role: "Admin" | "Editor" | "Viewer";
    invitedBy: string;
    userId?: string;
  }) {
    return await db.insert(this.table).values({
      characterId: values.characterId,
      email: values.email,
      role: values.role,
      invitedBy: values.invitedBy,
      userId: values.userId,
    }).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof contributorsInCharacter>>,
    where: { id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("character contributors don't soft-archive — use the status field");
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | { characterId: string; userId: string; status: "Pending" | "Active" | "Rejected" | "Revoked" }
      | { characterId: string; email: string; status: "Pending" | "Active" | "Rejected" | "Revoked" },
  ) {
    return await db.query.contributorsInCharacter.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "characterId" in where && eq(this.table.characterId, where.characterId),
        "userId" in where && eq(this.table.userId, where.userId),
        "email" in where && eq(this.table.email, where.email),
        "status" in where && eq(this.table.status, where.status),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(
    db: Db,
    where: { characterId: string; search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
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
      .orderBy(this.orderBy(this.table[orderBy], orderDir))
      .limit(limit)
      .offset(offset);

    const items = rows.map((row) => ({
      ...row.contributor,
      user: row.user,
    }));

    return this.paginated(items, pagination);
  }

  async findActiveRole(db: Db, where: { userId: string; characterId: string }): Promise<"Admin" | "Editor" | "Viewer" | null> {
    const contributor = await db.query.contributorsInCharacter.findFirst({
      where: this.where([
        eq(this.table.userId, where.userId),
        eq(this.table.characterId, where.characterId),
        eq(this.table.status, "Active"),
        isNull(this.table.deletedAt),
      ]),
    });

    return contributor?.role ?? null;
  }

  async findManyByUserId(
    db: Db,
    where: { userId: string; status: "Pending" | "Active" | "Rejected" | "Revoked" },
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

  // Single invite for a specific user, any status. Caller is responsible for
  // scoping by userId so a stranger can't probe other people's invite ids.
  async findOneForUser(db: Db, where: { id: string; userId: string }) {
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

  async findActiveByCharacterId(db: Db, where: { characterId: string }) {
    return await db.query.contributorsInCharacter.findMany({
      where: this.where([
        eq(this.table.characterId, where.characterId),
        eq(this.table.status, "Active"),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  withInstance(instance: InferSelectModel<typeof contributorsInCharacter>) {
    return new CharacterContributorInstance(instance);
  }
}

class CharacterContributorInstance extends Instance<InferSelectModel<typeof contributorsInCharacter>> {}

export default CharacterContributorsRepository;
