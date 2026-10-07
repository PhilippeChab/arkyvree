import type { PgTable } from "drizzle-orm/pg-core";

import { bonus, setFlag, setNum } from "@/content/dnd3.5/builders/customization/modifiers.ts";
import { gte } from "@/content/dnd3.5/builders/customization/requirements.ts";
import type {
  Modifier,
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/content/dnd3.5/builders/customization/types.ts";
import {
  modifiersInCustomization,
  type propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/text.ts";

import { getClassSpellLevels, type SpellcastingClass } from "./spellTable.ts";

type Ids = Record<string, string>;

type ModifierRow = typeof modifiersInCustomization.$inferInsert;
type PropertyRow = typeof propertiesInCustomization.$inferInsert;
type RequirementRow = typeof requirementsInCustomization.$inferInsert;

/**
 * The ruleset a seed writes to, and the ids of the rows its content names. Seeding aptitudes, feats or
 * powers adds them, so the steps after can name them.
 */
export type SeedContext = {
  abilityMap: Ids;
  /** Its aptitudes and its base ruleset's. */
  aptMap: Ids;
  /** Its feats and its base ruleset's, its own under a name they share. */
  featMap: Ids;
  /** Its base ruleset's powers, which it copies before adding them to a spell list (`cowPower`). */
  inheritedPowerMap: Ids;
  /** Its own powers. */
  powerMap: Ids;
  rulesetId: string;
  saveMap: Ids;
  skillMap: Ids;
};

/**
 * A seeder's core, which its steps (`concerns/`) build on: the database it writes to, the context it names rows by
 * (`ctx`, which each step adds to), and what every step writes with, the customizations' rows and their inserts.
 */
export class BaseSeeder {
  constructor(
    readonly db: Db,
    readonly ctx: SeedContext,
  ) {}

  /** Ids by name. */
  static idsByName(rows: { id: string; name: string }[]): Ids {
    return Object.fromEntries(rows.map((row) => [row.name, row.id]));
  }

  /** The id of a row the content names, or an error that says which. */
  protected idOf(ids: Ids, name: string, what: string): string {
    const id = ids[name];
    if (!id) throw new Error(`${what}: "${name}" isn't seeded`);
    return id;
  }

  /** A spell list's spells joining the list of the class whose level gave the source: a cleric's domain, the cleric's. */
  protected joinsClassList(sourceId: string, sourceType: string, list: string): ModifierRow {
    return { sourceId, sourceType, ...setFlag(`aptitudes.${list}.joinsclasslist`) };
  }

  /** A source's modifiers as rows. */
  protected modifierRows(
    sourceId: string,
    sourceType: string,
    modifiers: (Modifier | ModifierSeed)[] = [],
  ): ModifierRow[] {
    return modifiers.map(({ target, operator, value, valueType }) => ({
      sourceId,
      sourceType,
      target,
      operator,
      value,
      valueType,
    }));
  }

  /** An entity's properties as rows. */
  protected propertyRows(entityId: string, entityType: string, properties: Property[] = []): PropertyRow[] {
    return properties.map(({ type, value }) => ({ entityId, entityType, type, value }));
  }

  /** An entity's requirements as rows: each numbered by its place in the tree ("1", "2", "2.1"…). */
  protected requirementRows(entityId: string, entityType: string, entries: RequirementEntry[] = []): RequirementRow[] {
    const rows: RequirementRow[] = [];
    const walk = (list: RequirementEntry[], parent?: string) => {
      for (const [i, entry] of list.entries()) {
        const level = parent ? `${parent}.${i + 1}` : String(i + 1);
        if ("chainingOperator" in entry) {
          rows.push({ entityId, entityType, level, chainingOperator: entry.chainingOperator });
          walk(entry.children, level);
        } else {
          rows.push({ entityId, entityType, level, ...entry });
        }
      }
    };
    walk(entries);
    return rows;
  }

  /**
   * The slots a spell list gives: one more spell a day at each spell level from the first to the ninth, and any
   * spell of the list to prepare there (`allowed` set to -1).
   */
  protected spellListSlots(sourceId: string, sourceType: string, list: string): ModifierRow[] {
    return Array.from({ length: 9 }, (_, i) => [
      { sourceId, sourceType, ...bonus(`aptitudes.${list}.${i + 1}.uses`, 1) },
      { sourceId, sourceType, ...setNum(`aptitudes.${list}.${i + 1}.allowed`, -1) },
    ]).flat();
  }

  /** The rows without the repeats: the first of each key. */
  protected uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
    const seen = new Set<string>();
    return rows.filter((row) => !seen.has(key(row)) && seen.add(key(row)));
  }

  /** Inserts the rows, if there are any. */
  protected async insertAll<T extends PgTable>(table: T, rows: T["$inferInsert"][]) {
    if (rows.length > 0) await this.db.insert(table).values(rows);
  }

  /**
   * Inserts modifiers and gates the ones that give spell slots by the level of `klass` that opens their spell level (a
   * cleric's for a domain's slots, a wizard's for a school's). The first class level needs no gate.
   */
  protected async insertGatedSpellSlots(rows: ModifierRow[], klass: SpellcastingClass) {
    if (rows.length === 0) return;
    const classTarget = `classes.${stripSeparators(klass.name)}.level`;
    const spellLevels = getClassSpellLevels(klass.spells);
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
        return [{ entityId: id, entityType: "modifiers", level: "1", ...gte(classTarget, classLevel) }];
      }),
    );
  }

  /**
   * Modifiers with their sources: the ones without requirements in one insert, and each one with requirements alone,
   * its requirements as rows of it.
   */
  protected async insertModifiers(sourceType: string, modifiers: { modifier: ModifierSeed; sourceId: string }[]) {
    const plain = modifiers.filter(({ modifier }) => !modifier.requirements?.length);
    await this.insertAll(
      modifiersInCustomization,
      plain.flatMap(({ sourceId, modifier }) => this.modifierRows(sourceId, sourceType, [modifier])),
    );
    for (const { sourceId, modifier } of modifiers.filter(({ modifier }) => modifier.requirements?.length)) {
      const [row] = await this.db
        .insert(modifiersInCustomization)
        .values(this.modifierRows(sourceId, sourceType, [modifier]))
        .returning({ id: modifiersInCustomization.id });
      await this.insertAll(
        requirementsInCustomization,
        this.requirementRows(row.id, "modifiers", modifier.requirements),
      );
    }
  }
}
