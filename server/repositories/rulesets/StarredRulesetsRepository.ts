import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { starredRulesetsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class StarredRulesetsRepository extends BaseRepository<typeof starredRulesetsInAccount> {
  constructor() {
    super(starredRulesetsInAccount);
  }

  async archive(db: Db, where: { userId: string; rulesetId: string } | { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        this.branchWhere(
          [eq(this.table.userId, where.userId)],
          ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
        ),
      )
      .returning();
  }

  async count(db: Db, where: { rulesetId: string }) {
    const [row] = await db
      .select({ count: count() })
      .from(this.table)
      .where(and(eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)));
    return row?.count ?? 0;
  }

  /** Each ruleset's star count, by ruleset id (a ruleset without stars has no entry). */
  async countPerRuleset(db: Db, where: { rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0) return new Map<string, number>();
    const rows = await db
      .select({ rulesetId: this.table.rulesetId, count: count() })
      .from(this.table)
      .where(and(inArray(this.table.rulesetId, where.rulesetIds), isNull(this.table.deletedAt)))
      .groupBy(this.table.rulesetId);
    return new Map(rows.map((r) => [r.rulesetId, r.count]));
  }

  async findMany(db: Db, where: { userId: string }) {
    return await db.query.starredRulesetsInAccount.findMany({
      where: and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)),
    });
  }

  async findOne(db: Db, where: { userId: string; rulesetId: string }) {
    return await db.query.starredRulesetsInAccount.findFirst({
      where: and(
        eq(this.table.userId, where.userId),
        eq(this.table.rulesetId, where.rulesetId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  /** Stars the ruleset, or restores an archived star. */
  async upsert(db: Db, values: { userId: string; rulesetId: string }) {
    return await db
      .insert(this.table)
      .values(values)
      .onConflictDoUpdate({
        target: [this.table.userId, this.table.rulesetId],
        set: {
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
  }
}

export default StarredRulesetsRepository;
