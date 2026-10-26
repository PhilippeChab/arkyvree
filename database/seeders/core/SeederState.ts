import { inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { Modifier, ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { entitySnapshotsInRules, modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { EntityWrite } from "@/engine/index.ts";
import StoredEntities from "@/server/repositories/stored/StoredEntities.ts";
import StoredFields, { type FieldsUpdate } from "@/server/repositories/stored/StoredFields.ts";
import StoredLinks, { type NewLink } from "@/server/repositories/stored/StoredLinks.ts";

type ModifierRow = typeof modifiersInCustomization.$inferInsert;
type RequirementRow = typeof requirementsInCustomization.$inferInsert;

/**
 * The ruleset a seed writes to; a module's seeder adds the ids of the rows its content names (3.5's
 * `Dnd35SeedContext`), which its steps add as they seed them, so the steps after can name them.
 */
export interface SeedContext {
  rulesetId: string;
}

/** Ids by name. */
export type Ids = Record<string, string>;

/** The generic tables' repositories a seeder writes through, as the server does (no request's cache: no request). */
export const Entities = new StoredEntities();
export const EntityLinks = new StoredLinks();
export const Fields = new StoredFields();

/**
 * A seeder's state, which every seeding step builds on (`concerns/`, and a ruleset's): the database it writes to, the
 * context it names rows by (`ctx`, its ruleset's id and the ids its steps add), and what the steps write with: the
 * entities' rows, their links and their stored values as the generic tables store them (`Entities`, `EntityLinks`,
 * `Fields`, by what the module declares), the customizations' rows and their inserts, and the copies an extension makes
 * of what it changes.
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
   * Copies entities' requirements, modifiers (with theirs) and stored values onto their copies (`copies`: each entity's
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
    const values = await Fields.findMany(this.db, { ownerIds: [...copies.keys()], ownerType: type });
    await this.writeFields([...copies].map(([id, copyId]) => ({ id: copyId, type, values: values.get(id)! })));
  }

  /** A kind's entities (`type`, `ids`), as their records: their own columns, own fields and single links. */
  protected async entityRecords<R extends { id: string }>(type: string, ids: string[]): Promise<R[]> {
    return await Entities.findMany<R>(this.db, { entityType: type, ids });
  }

  /** Inserts the rows, if there are any. */
  protected async insertAll<T extends PgTable>(table: T, rows: T["$inferInsert"][]) {
    if (rows.length > 0) await this.db.insert(table).values(rows);
  }

  /** Inserts a kind's entities (`type`, `writes`): answers their ids by name. */
  protected async insertEntities(type: string, writes: EntityWrite[]): Promise<Ids> {
    const ids = await this.insertRows(type, writes);
    return Object.fromEntries(writes.map((write, i) => [write.name!, ids[i]]));
  }

  /** Inserts entities' links (`links`, each from its entity, by its role: a feat's pools, a class level's grants). */
  protected async insertLinks(links: NewLink[]) {
    await EntityLinks.createMany(this.db, links);
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

  /** Inserts a kind's entities (`type`, `writes`: an owned kind's, which has no name, too): answers their ids. */
  protected async insertRows(type: string, writes: EntityWrite[]): Promise<string[]> {
    return await Entities.createIds(this.db, type, writes);
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

  /** Writes owners' stored values (`writes`: an entity's or a ruleset's fields, and the links its fields read). */
  protected async writeFields(writes: FieldsUpdate[]) {
    await Fields.update(this.db, writes);
  }
}
