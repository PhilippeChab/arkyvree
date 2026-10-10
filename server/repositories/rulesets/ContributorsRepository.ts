import { and, eq, type InferInsertModel, isNull, not, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { contributorsInRules, usersInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
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
      email: string;
      invitedBy: string;
      role: ContributorRole;
      rulesetId: string;
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
    where: { status: ContributorStatus; userId: string },
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
      | { rulesetId: string; status: ContributorStatus; userId: string }
      | { email: string; rulesetId: string; status: ContributorStatus },
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
    where: { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; rulesetId: string; search?: string },
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
      .orderBy(...this.pageOrder(this.orderBy(this.table[orderBy], orderDir)))
      .limit(limit)
      .offset(offset);

    const items = rows.map((row) => ({
      ...row.contributor,
      user: row.user,
    }));

    return this.paginated(items, pagination);
  }

  /** The user's role on the ruleset, when they're an active contributor: what the ruleset's policy grants by. */
  async findRole(db: Db, where: { rulesetId: string; userId: string }): Promise<ContributorRole | undefined> {
    const contributor = await db.query.contributorsInRules.findFirst({
      where: this.where([
        eq(this.table.userId, where.userId),
        eq(this.table.rulesetId, where.rulesetId),
        eq(this.table.status, "Active"),
        isNull(this.table.deletedAt),
      ]),
    });

    return contributor?.role;
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
