import { and, eq, isNull } from "drizzle-orm";

import { rulesetExtensionsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferSelectModel } from "drizzle-orm";

class RulesetExtensionsRepository extends BaseRepository<typeof rulesetExtensionsInRules, RulesetExtensionInstance> {
  constructor() {
    super(rulesetExtensionsInRules);
  }

  async create(db: Db, values: { rulesetId: string; extensionId: string }) {
    return await db.insert(this.table).values(values).returning();
  }

  async upsert(db: Db, values: { rulesetId: string; extensionId: string }) {
    return await db
      .insert(this.table)
      .values(values)
      .onConflictDoUpdate({
        target: [this.table.rulesetId, this.table.extensionId],
        set: {
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
  }

  async update(): Promise<InferSelectModel<typeof rulesetExtensionsInRules>[]> {
    throw new Error("Not supported — use upsert");
  }

  async archive(db: Db, where: { rulesetId: string; extensionId: string }) {
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

  async findOne(db: Db, where: { rulesetId: string; extensionId: string }) {
    return await db.query.rulesetExtensionsInRules.findFirst({
      where: and(
        eq(this.table.rulesetId, where.rulesetId),
        eq(this.table.extensionId, where.extensionId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findByRulesetId(db: Db, where: { rulesetId: string }) {
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
      .where(
        and(
          eq(this.table.rulesetId, where.rulesetId),
          isNull(this.table.deletedAt),
        ),
      );
  }

  withInstance(instance: InferSelectModel<typeof rulesetExtensionsInRules>) {
    return new RulesetExtensionInstance(instance);
  }
}

class RulesetExtensionInstance extends Instance<InferSelectModel<typeof rulesetExtensionsInRules>> {}

export default RulesetExtensionsRepository;
