import { inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type {
  Modifier,
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/content/core/builders/customization/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { entitySnapshotsInRules, modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import StoredEntities from "@/server/repositories/stored/StoredEntities.ts";
import StoredJoins, { type JoinRow } from "@/server/repositories/stored/StoredJoins.ts";
import StoredProperties, { type FieldValues } from "@/server/repositories/stored/StoredProperties.ts";

type Ids = Record<string, string>;

type ModifierRow = typeof modifiersInCustomization.$inferInsert;
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

/** The generic tables' repositories a seeder writes through, as the server does (no request's cache: no request). */
export const Entities = new StoredEntities();
export const Joins = new StoredJoins();
export const Properties = new StoredProperties();

/**
 * A seeder's state, which every seeding step builds on (`concerns/`, and a ruleset's): the database it writes to, the
 * context it names rows by (`ctx`, its ruleset's id and the ids its steps add), and what the steps write with: the
 * entities' rows, their joins and their properties as the generic tables store them (`Entities`, `Joins`, `Properties`,
 * by what the module declares), the customizations' rows and their inserts, and the copies an extension makes of what
 * it changes.
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

  /** Copies entities' requirements onto their copies (`copies`: each entity's copy, by its id), in one write. */
  private async copyRequirements(copies: Map<string, string>) {
    if (copies.size === 0) return;
    const rows = await this.db
      .select()
      .from(requirementsInCustomization)
      .where(inArray(requirementsInCustomization.entityId, [...copies.keys()]));
    await this.insertAll(
      requirementsInCustomization,
      rows.map(({ entityId, entityType, level, target, operator, value, valueType, chainingOperator }) => ({
        entityId: copies.get(entityId)!,
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
  protected propertyRows(entityId: string, entityType: string, properties: Property[] = []): FieldValues[] {
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

  /**
   * Copies entities' requirements, modifiers (with theirs) and properties onto their copies (`copies`: each entity's
   * copy, by its id), of a type: a few writes, however many copies.
   */
  protected async copyCustomizations(type: string, copies: Map<string, string>) {
    if (copies.size === 0) return;
    await this.copyRequirements(copies);
    const modifiers = await this.db
      .select()
      .from(modifiersInCustomization)
      .where(inArray(modifiersInCustomization.sourceId, [...copies.keys()]));
    // Each modifier's copy has its id before it's written, which its requirements' copies name
    const modifierCopies = new Map(modifiers.map((modifier) => [modifier.id, crypto.randomUUID()]));
    await this.insertAll(
      modifiersInCustomization,
      modifiers.map(({ id, sourceId, sourceType, target, value, valueType, operator }) => ({
        id: modifierCopies.get(id)!,
        sourceId: copies.get(sourceId)!,
        sourceType,
        target,
        value,
        valueType,
        operator,
      })),
    );
    await this.copyRequirements(modifierCopies);
    const properties = await Properties.findMany(this.db, { entityIds: [...copies.keys()], entityType: type });
    await this.insertProperties(
      properties.map(({ entityId, entityType, type: propertyType, value }) => ({
        entityId: copies.get(entityId)!,
        entityType,
        type: propertyType,
        value,
      })),
    );
  }

  /** A kind's rows of entities (`type`, `ids`), by their columns. */
  protected async entityRows<R>(type: string, ids: string[]): Promise<R[]> {
    const stored = await Entities.findStored(this.db, { ids });
    return stored.filter((entity) => entity.type === type).map((entity) => Engine.storage().rowOf(entity) as R);
  }

  /** Inserts the rows, if there are any. */
  protected async insertAll<T extends PgTable>(table: T, rows: T["$inferInsert"][]) {
    if (rows.length > 0) await this.db.insert(table).values(rows);
  }

  /** Inserts a kind's rows (`type`), each by its columns: answers their ids by name. */
  protected async insertEntities(type: string, rows: Record<string, unknown>[]): Promise<Ids> {
    const ids = await this.insertRows(type, rows);
    return Object.fromEntries(rows.map((row, i) => [row.name as string, ids[i]]));
  }

  /** Inserts a join's rows (`join`: a feat's pools, a class level's grants), each by its columns. */
  protected async insertJoins(join: string, rows: JoinRow[]) {
    await Joins.createIds(this.db, join, rows);
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

  /** Inserts properties: each an entity's or a ruleset's field, or the link its value names. */
  protected async insertProperties(rows: FieldValues[]) {
    await Properties.createMany(this.db, rows);
  }

  /** Inserts a kind's rows (`type`), each by its columns (an owned kind's, which has no name): answers their ids. */
  protected async insertRows(type: string, rows: Record<string, unknown>[]): Promise<string[]> {
    return await Entities.createIds(this.db, type, rows);
  }

  /** Records copies (`copies`: each entity's copy, by its id) in `entity_snapshots`: the ruleset shows each in place of its original. */
  protected async recordCopies(entityType: string, copies: Map<string, string>) {
    await this.insertAll(
      entitySnapshotsInRules,
      [...copies].map(([sourceEntityId, forkedEntityId]) => ({
        rulesetId: this.ctx.rulesetId,
        entityType,
        sourceEntityId,
        forkedEntityId,
      })),
    );
  }
}
