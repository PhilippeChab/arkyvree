import { and, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { rulesetExtensionsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/**
 * The extensions each ruleset subscribes to: a live row per extension, in their order (`ordinal`), which its view
 * composes them in. An unsubscribe archives its row, which a subscribe again brings back, last.
 */
class RulesetExtensionsRepository extends BaseRepository<typeof rulesetExtensionsInRules> {
  constructor() {
    super(rulesetExtensionsInRules);
  }

  async archive(db: Db, where: { extensionId: string; rulesetId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.rulesetId, where.rulesetId),
          eq(this.table.extensionId, where.extensionId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async findMany(db: Db, where: { rulesetId: string }) {
    return await db
      .select({
        rulesetId: this.table.rulesetId,
        extensionId: this.table.extensionId,
        subscribedAt: this.table.createdAt,
        updatedAt: this.table.updatedAt,
        extensionName: rulesetsInRules.name,
        extensionDescription: rulesetsInRules.description,
        extensionUpdatedAt: rulesetsInRules.updatedAt,
      })
      .from(this.table)
      .innerJoin(rulesetsInRules, eq(this.table.extensionId, rulesetsInRules.id))
      .where(and(eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)))
      .orderBy(this.orderBy(this.table.ordinal));
  }

  /**
   * Subscribes a ruleset to extensions (`extensionIds`), after those it subscribes to, in their order: each one's row,
   * live again if it was archived.
   */
  async upsert(db: Db, values: { extensionIds: string[]; rulesetId: string }) {
    const { extensionIds, rulesetId } = values;
    if (extensionIds.length === 0) return [];
    // The place after the ruleset's last live row's, which every row of the insert reads as the table was before it
    const live = and(eq(this.table.rulesetId, rulesetId), isNull(this.table.deletedAt));
    const next = sql`(SELECT coalesce(max(${this.table.ordinal}) + 1, 0) FROM ${this.table} WHERE ${live})`;
    return await db
      .insert(this.table)
      .values(extensionIds.map((extensionId, index) => ({ rulesetId, extensionId, ordinal: sql`${next} + ${index}` })))
      .onConflictDoUpdate({
        target: [this.table.rulesetId, this.table.extensionId],
        set: {
          deletedAt: null,
          ordinal: sql`excluded.ordinal`,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
  }
}

export default RulesetExtensionsRepository;
