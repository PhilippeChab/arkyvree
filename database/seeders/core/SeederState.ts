import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type {
  Modifier,
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/content/core/builders/customization/types.ts";
import {
  entitySnapshotsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

type Ids = Record<string, string>;

type ModifierRow = typeof modifiersInCustomization.$inferInsert;
type PropertyRow = typeof propertiesInCustomization.$inferInsert;
type RequirementRow = typeof requirementsInCustomization.$inferInsert;

/**
 * The ruleset a seed writes to, and the ids of the rows its content names. Seeding aptitudes, feats or
 * powers adds them, so the steps after can name them.
 */
export interface SeedContext {
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
}

/**
 * A seeder's state, which every seeding step builds on (`concerns/`, and a ruleset's): the database it writes to, the
 * context it names rows by (`ctx`, its ruleset's id and the ids its steps add), and what the steps write with: the
 * customizations' rows and their inserts, and the copies an extension makes of what it changes.
 */
export abstract class SeederState {
  constructor(
    readonly db: Db,
    readonly ctx: SeedContext,
  ) {}

  /** Ids by name. */
  static idsByName(rows: { id: string; name: string }[]): Ids {
    return Object.fromEntries(rows.map((row) => [row.name, row.id]));
  }

  /** Copies an entity's requirements onto its copy. */
  private async copyRequirements(fromId: string, toId: string) {
    const rows = await this.db
      .select()
      .from(requirementsInCustomization)
      .where(eq(requirementsInCustomization.entityId, fromId));
    await this.insertAll(
      requirementsInCustomization,
      rows.map(({ entityType, level, target, operator, value, valueType, chainingOperator }) => ({
        entityId: toId,
        entityType,
        level,
        target,
        operator,
        value,
        valueType,
        chainingOperator,
      })),
    );
  }

  /** The id of a row the content names, or an error that says which. */
  protected idOf(ids: Ids, name: string, what: string): string {
    const id = ids[name];
    if (!id) throw new Error(`${what}: "${name}" isn't seeded`);
    return id;
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

  /** The rows without the repeats: the first of each key. */
  protected uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
    const seen = new Set<string>();
    return rows.filter((row) => !seen.has(key(row)) && seen.add(key(row)));
  }

  /** Copies an entity's requirements, modifiers (with theirs) and properties onto its copy. */
  protected async copyCustomizations(fromId: string, toId: string) {
    await this.copyRequirements(fromId, toId);
    for (const modifier of await this.db
      .select()
      .from(modifiersInCustomization)
      .where(eq(modifiersInCustomization.sourceId, fromId))) {
      const { sourceType, target, value, valueType, operator } = modifier;
      const [copy] = await this.db
        .insert(modifiersInCustomization)
        .values({ sourceId: toId, sourceType, target, value, valueType, operator })
        .returning({ id: modifiersInCustomization.id });
      await this.copyRequirements(modifier.id, copy.id);
    }
    const properties = await this.db
      .select()
      .from(propertiesInCustomization)
      .where(eq(propertiesInCustomization.entityId, fromId));
    await this.insertAll(
      propertiesInCustomization,
      properties.map(({ entityType, type, value, description }) => ({
        entityId: toId,
        entityType,
        type,
        value,
        description,
      })),
    );
  }

  /** Inserts the rows, if there are any. */
  protected async insertAll<T extends PgTable>(table: T, rows: T["$inferInsert"][]) {
    if (rows.length > 0) await this.db.insert(table).values(rows);
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

  /** Records a copy in `entity_snapshots`, so the ruleset shows it in place of the original. */
  protected async recordCopy(entityType: string, sourceEntityId: string, forkedEntityId: string) {
    await this.db.insert(entitySnapshotsInRules).values({
      rulesetId: this.ctx.rulesetId,
      entityType,
      sourceEntityId,
      forkedEntityId,
    });
  }
}
