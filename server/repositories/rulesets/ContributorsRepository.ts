import { and, eq, type InferInsertModel, isNull, not, or } from "drizzle-orm";

import { contributorsInRules, usersInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import type { ContributorRole } from "@/shared/enums.ts";

/** A contributor's status (the tables' CHECK constraint): ruleset and character contributors share it. */
export type ContributorStatus = "Pending" | "Active" | "Rejected" | "Revoked";

class ContributorsRepository extends include(BaseRepository<typeof contributorsInRules>, Paginates, Searches) {
  constructor() {
    super(contributorsInRules);
  }

  async findMany(db: Db, where: { rulesetId: string; status: ContributorStatus }) {
    return await db.query.contributorsInRules.findMany({
      where: this.where([
        eq(this.table.rulesetId, where.rulesetId),
        eq(this.table.status, where.status),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findManyWithRuleset(
    db: Db,
    where: { userId: string; status: ContributorStatus },
    pagination: { limit: number } = { limit: 100 },
  ) {
    return await db.query.contributorsInRules.findMany({
      where: this.where([
        eq(this.table.userId, where.userId),
        eq(this.table.status, where.status),
        isNull(this.table.deletedAt),
      ]),
      with: {
        rulesetsInRule: {
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
      | { rulesetId: string; userId: string; status: ContributorStatus }
      | { rulesetId: string; email: string; status: ContributorStatus },
  ) {
    return await db.query.contributorsInRules.findFirst({
      where: this.branchWhere(
        [
          "id" in where && eq(this.table.id, where.id),
          "userId" in where && eq(this.table.userId, where.userId),
          "email" in where && eq(this.table.email, where.email),
        ],
        [
          "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
          "status" in where && eq(this.table.status, where.status),
          isNull(this.table.deletedAt),
        ],
      ),
    });
  }

  // Single invite for a specific user, any status. Caller is responsible for
  // scoping by userId so a stranger can't probe other people's invite ids.
  async findOneWithRuleset(db: Db, where: { id: string; userId: string }) {
    return await db.query.contributorsInRules.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        eq(this.table.userId, where.userId),
        isNull(this.table.deletedAt),
      ]),
      with: {
        rulesetsInRule: {
          columns: { id: true, name: true, status: true },
        },
      },
    });
  }

  async findPage(
    db: Db,
    where: { rulesetId: string; search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
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
          eq(this.table.rulesetId, where.rulesetId),
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

  /** The user's role on the ruleset as an active contributor, or null: what the ruleset's policy grants by. */
  async findRole(db: Db, where: { userId: string; rulesetId: string }): Promise<ContributorRole | null> {
    const contributor = await db.query.contributorsInRules.findFirst({
      where: this.where([
        eq(this.table.userId, where.userId),
        eq(this.table.rulesetId, where.rulesetId),
        eq(this.table.status, "Active"),
        isNull(this.table.deletedAt),
      ]),
    });

    return contributor?.role ?? null;
  }

  async create(
    db: Db,
    values: {
      rulesetId: string;
      email: string;
      role: ContributorRole;
      invitedBy: string;
      userId?: string;
    },
  ) {
    return await db
      .insert(this.table)
      .values({
        rulesetId: values.rulesetId,
        email: values.email,
        role: values.role,
        invitedBy: values.invitedBy,
        userId: values.userId,
      })
      .returning();
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

  async update(db: Db, values: Partial<InferInsertModel<typeof contributorsInRules>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }
}

export default ContributorsRepository;
