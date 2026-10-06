import type { PgTable } from "drizzle-orm/pg-core";

import type { ModifierSeed } from "@/database/packages/dnd35/content/types.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { type ModifierRow, modifierRows, requirementRows } from "@/database/packages/dnd35/seed/customizationRows.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * What a ruleset's seeding writes with, which its concerns build on: the database, the ids by name of the rows its
 * content names (`ctx`, which each step adds to), and the writes several steps share.
 */
export class SeederState {
  constructor(
    readonly db: Db,
    readonly ctx: SeedContext,
  ) {}

  /** Inserts the rows, if there are any. */
  protected async insertAll<T extends PgTable>(table: T, rows: T["$inferInsert"][]) {
    if (rows.length > 0) await this.db.insert(table).values(rows);
  }

  /**
   * Inserts modifiers and gates the ones that give spell slots by the class level that opens their spell level:
   * `spellLevels` maps a spell level to it. The first class level needs no gate.
   */
  protected async insertGatedSpellSlots(rows: ModifierRow[], classTarget: string, spellLevels: Record<number, number>) {
    if (rows.length === 0) return;
    const inserted = await this.db
      .insert(modifiersInCustomization)
      .values(rows)
      .returning({ id: modifiersInCustomization.id, target: modifiersInCustomization.target });
    await this.insertAll(
      requirementsInCustomization,
      inserted.flatMap(({ id, target }) => {
        const spellLevel = target.match(/^aptitudes\.\w+\.(\d+)\.(uses|allowed)$/)?.[1];
        const classLevel = spellLevel === undefined ? undefined : spellLevels[Number(spellLevel)];
        if (classLevel === undefined || classLevel <= 1) return [];
        return [
          {
            entityId: id,
            entityType: "modifiers",
            level: "1",
            target: classTarget,
            operator: "greater_than_or_equal",
            value: String(classLevel),
            valueType: "number",
          },
        ];
      }),
    );
  }

  /**
   * Modifiers with their sources: the ones without requirements in one insert, and each one with requirements alone,
   * its requirements as rows of it.
   */
  protected async insertModifiers(sourceType: string, modifiers: { sourceId: string; modifier: ModifierSeed }[]) {
    const plain = modifiers.filter(({ modifier }) => !modifier.requirements?.length);
    await this.insertAll(
      modifiersInCustomization,
      plain.flatMap(({ sourceId, modifier }) => modifierRows(sourceId, sourceType, [modifier])),
    );
    for (const { sourceId, modifier } of modifiers.filter(({ modifier }) => modifier.requirements?.length)) {
      const [row] = await this.db
        .insert(modifiersInCustomization)
        .values(modifierRows(sourceId, sourceType, [modifier]))
        .returning({ id: modifiersInCustomization.id });
      await this.insertAll(requirementsInCustomization, requirementRows(row.id, "modifiers", modifier.requirements));
    }
  }
}
