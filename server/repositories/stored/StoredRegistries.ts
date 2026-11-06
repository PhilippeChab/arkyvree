import { and, eq, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import {
  characterRolesInCharacter,
  entityTypesInRules,
  fieldDefsInRules,
  itemTypesInCharacter,
  linkRoleKindsInRules,
  linkRolesInRules,
  modulesInRules,
  rulesetRolesInRules,
  stepsInCharacter,
} from "@/drizzle/schema.ts";
import { Engine, type StorageRegistries } from "@/engine/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/**
 * A registry table, as the sync compares it: its key's columns, each declared row's key, and how to name a row (by its
 * key's values) when one can't go.
 */
interface Registry {
  columns: PgColumn[];
  declared: (string | null)[][];
  name: (key: string[]) => string;
  /** The order its stored rows go in, when one names another of the table (an owned type, its owner) */
  order?: SQL;
  table: PgTable;
}

/** What the registries must hold: every registered module's declarations, by its base rules. */
export type DeclaredRegistries = { baseRules: BaseRules; registries: StorageRegistries }[];

/** Postgres's code for a foreign key a delete would break. */
const FOREIGN_KEY_VIOLATION = "23503";

/** The character's registry tables (its items' types, its advancements' steps, its roles), as `registriesOf` orders them. */
function characterRegistriesOf(declared: DeclaredRegistries): Registry[] {
  return [
    {
      table: itemTypesInCharacter,
      columns: [itemTypesInCharacter.baseRules, itemTypesInCharacter.entityType],
      declared: keysOf(
        declared,
        (registries) => registries.itemTypes,
        (type) => [type],
      ),
      name: ([baseRules, type]) => `item type ${type} of ${baseRules}`,
    },
    {
      table: stepsInCharacter,
      columns: [stepsInCharacter.baseRules, stepsInCharacter.step],
      declared: keysOf(
        declared,
        (registries) => registries.steps,
        (def) => [def.step],
      ),
      name: ([baseRules, step]) => `step ${step} of ${baseRules}`,
    },
    {
      table: characterRolesInCharacter,
      columns: [characterRolesInCharacter.baseRules, characterRolesInCharacter.role],
      declared: keysOf(
        declared,
        (registries) => registries.characterRoles,
        (def) => [def.role],
      ),
      name: ([baseRules, role]) => `character role ${role} of ${baseRules}`,
    },
  ];
}

/** Whether an error is Postgres refusing a delete that rows still reference. */
function isForeignKeyViolation(error: unknown): boolean {
  const failure = error as { cause?: { code?: string }; code?: string } | undefined;
  return failure?.code === FOREIGN_KEY_VIOLATION || failure?.cause?.code === FOREIGN_KEY_VIOLATION;
}

/** A key of its values, as one string: what tells a declared row from a stored one. */
function keyOf(values: unknown[]) {
  return JSON.stringify(values);
}

/**
 * Each declared row's key (`key`, of each row `pick` reads of a module's registries), its module's base rules first:
 * every module's.
 */
function keysOf<T>(
  declared: DeclaredRegistries,
  pick: (registries: StorageRegistries) => readonly T[],
  key: (row: T) => (string | null)[],
) {
  return declared.flatMap(({ baseRules, registries }) => pick(registries).map((row) => [baseRules, ...key(row)]));
}

/**
 * The registry tables, in the order their undeclared rows can go: a row that names another goes first (a type's
 * fields and roles before the type, an owned type before its owner, every row before its module). Each is keyed by its
 * module's base rules first: two modules' rows of one name are two rows.
 */
function registriesOf(declared: DeclaredRegistries): Registry[] {
  return [...characterRegistriesOf(declared), ...rulesRegistriesOf(declared)];
}

/**
 * The rules' registry tables (a ruleset's roles, the fields, the link roles, the entity types, the modules), as
 * `registriesOf` orders them.
 */
function rulesRegistriesOf(declared: DeclaredRegistries): Registry[] {
  return [
    {
      table: rulesetRolesInRules,
      columns: [rulesetRolesInRules.baseRules, rulesetRolesInRules.role],
      declared: keysOf(
        declared,
        (registries) => registries.rulesetRoles,
        (def) => [def.role],
      ),
      name: ([baseRules, role]) => `ruleset role ${role} of ${baseRules}`,
    },
    {
      table: fieldDefsInRules,
      columns: [fieldDefsInRules.baseRules, fieldDefsInRules.ownerType, fieldDefsInRules.field],
      declared: keysOf(
        declared,
        (registries) => registries.fieldDefs,
        (def) => [def.ownerType, def.field],
      ),
      name: ([baseRules, ownerType, field]) => `field ${field} of ${ownerType} of ${baseRules}`,
    },
    {
      table: linkRolesInRules,
      columns: [linkRolesInRules.baseRules, linkRolesInRules.role, linkRolesInRules.fromType, linkRolesInRules.toType],
      declared: keysOf(
        declared,
        (registries) => registries.linkRoles,
        (def) => [def.role, def.fromType, def.toType],
      ),
      name: ([baseRules, role, fromType, toType]) => `link role ${role} from ${fromType} to ${toType} of ${baseRules}`,
    },
    {
      table: linkRoleKindsInRules,
      columns: [linkRoleKindsInRules.baseRules, linkRoleKindsInRules.role, linkRoleKindsInRules.fromType],
      declared: keysOf(
        declared,
        (registries) => registries.linkRoles,
        (def) => [def.role, def.fromType],
      ),
      name: ([baseRules, role, fromType]) => `link role ${role} from ${fromType} of ${baseRules}`,
    },
    {
      table: entityTypesInRules,
      columns: [entityTypesInRules.baseRules, entityTypesInRules.type],
      declared: keysOf(
        declared,
        (registries) => registries.entityTypes,
        (def) => [def.type],
      ),
      name: ([baseRules, type]) => `entity type ${type} of ${baseRules}`,
      // Owned types first: their rows name their owners
      order: sql`${entityTypesInRules.ownerType} IS NULL`,
    },
    {
      table: modulesInRules,
      columns: [modulesInRules.baseRules],
      declared: declared.map(({ baseRules }) => [baseRules]),
      name: ([baseRules]) => `module ${baseRules}`,
    },
  ];
}

/**
 * The registries as the database holds them, kept to what the registered modules declare (`Engine.storages()`, each
 * one's `registries()`): every migrate writes them (`scripts/db/migrate.ts`), so a module's new entity type, field,
 * link role or step is a code change only. Each row is its module's, keyed by its base rules first: two modules
 * declaring one name (each its feats) are two rows, which their own rows' keys name. A declaration that changed
 * rewrites the rows that carry it (a field that becomes a set, a role that becomes single: their foreign keys cascade),
 * and the database refuses one its rows can't take. A row no module declares any more goes, unless rows still use it:
 * then the sync is refused, naming it. They keep what the rows are checked against, never what the engine alone reads
 * of a declaration: how sibling copies merge a field or a link, the role an entity reads a field off another through.
 */
export default class StoredRegistries {
  /** Removes what no module declares any more, refusing, by its name, a row that rows still use. */
  private static async removeUndeclared(db: Db, declared: DeclaredRegistries) {
    for (const { columns, declared: keys, name, order, table } of registriesOf(declared)) {
      const kept = new Set(keys.map(keyOf));
      const stored = (await db
        .select(Object.fromEntries(columns.map((column, i) => [`k${i}`, column])))
        .from(table)
        .orderBy(order ?? sql`1`)) as Record<string, string>[];
      for (const row of stored) {
        const key = columns.map((_, i) => row[`k${i}`]);
        if (kept.has(keyOf(key))) continue;
        try {
          // A savepoint, so a refused delete names its row instead of failing the transaction's next statement
          await db.transaction(async (tx) => {
            await tx.delete(table).where(and(...columns.map((column, i) => eq(column, key[i]))));
          });
        } catch (error) {
          if (!isForeignKeyViolation(error)) throw error;
          throw new Error(`No module declares the ${name(key)} any more, but rows still use it: migrate them first`, {
            cause: error,
          });
        }
      }
    }
  }

  /** Writes the modules and each one's entity types: an owner before the types it owns, whose rows name it. */
  private static async writeEntityTypes(db: Db, declared: DeclaredRegistries) {
    if (declared.length > 0) {
      await db
        .insert(modulesInRules)
        .values(declared.map(({ baseRules }) => ({ baseRules })))
        .onConflictDoNothing();
    }
    for (const { baseRules, registries } of declared) {
      const types = [...registries.entityTypes].sort(
        (a, b) => Number(a.ownerType !== null) - Number(b.ownerType !== null),
      );
      for (const def of types) {
        await db
          .insert(entityTypesInRules)
          .values({ baseRules, type: def.type, ownerType: def.ownerType })
          .onConflictDoUpdate({
            target: [entityTypesInRules.baseRules, entityTypesInRules.type],
            set: { ownerType: def.ownerType },
          });
      }
    }
  }

  /** Writes each module's fields: a change of kind or of set-ness rewrites the rows that hold the field. */
  private static async writeFields(db: Db, declared: DeclaredRegistries) {
    for (const { baseRules, registries } of declared) {
      for (const def of registries.fieldDefs) {
        const values = {
          ownerKind: def.ownerKind,
          valueKind: def.valueKind,
          multiple: def.multiple,
        };
        await db
          .insert(fieldDefsInRules)
          .values({ baseRules, ownerType: def.ownerType, field: def.field, ...values })
          .onConflictDoUpdate({
            target: [fieldDefsInRules.baseRules, fieldDefsInRules.ownerType, fieldDefsInRules.field],
            set: values,
          });
      }
    }
  }

  /**
   * Writes each module's link roles: first each role's single for its from-type, which its rows and its links carry (a
   * change rewrites them), then each role from a type to another.
   */
  private static async writeLinkRoles(db: Db, declared: DeclaredRegistries) {
    for (const { baseRules, registries } of declared) {
      const kinds = new Map(registries.linkRoles.map((def) => [keyOf([def.role, def.fromType]), def]));
      for (const def of kinds.values()) {
        await db
          .insert(linkRoleKindsInRules)
          .values({ baseRules, role: def.role, fromType: def.fromType, single: def.single })
          .onConflictDoUpdate({
            target: [linkRoleKindsInRules.baseRules, linkRoleKindsInRules.role, linkRoleKindsInRules.fromType],
            set: { single: def.single },
          });
      }
      for (const def of registries.linkRoles) {
        const values = { viaType: def.viaType, onDelete: def.onDelete, viaOnDelete: def.viaOnDelete };
        await db
          .insert(linkRolesInRules)
          .values({
            baseRules,
            role: def.role,
            fromType: def.fromType,
            toType: def.toType,
            single: def.single,
            ...values,
          })
          .onConflictDoUpdate({
            target: [
              linkRolesInRules.baseRules,
              linkRolesInRules.role,
              linkRolesInRules.fromType,
              linkRolesInRules.toType,
            ],
            set: values,
          });
      }
    }
  }

  /** Writes each module's ruleset roles, its character roles, its advancements' steps and the types its items are. */
  private static async writeOwnersRoles(db: Db, declared: DeclaredRegistries) {
    for (const { baseRules, registries } of declared) {
      for (const def of registries.rulesetRoles) {
        const values = { toType: def.toType, onDelete: def.onDelete };
        await db
          .insert(rulesetRolesInRules)
          .values({ baseRules, role: def.role, ...values })
          .onConflictDoUpdate({ target: [rulesetRolesInRules.baseRules, rulesetRolesInRules.role], set: values });
      }
      for (const def of registries.characterRoles) {
        const values = { entityType: def.entityType, single: def.single, onDelete: def.onDelete };
        await db
          .insert(characterRolesInCharacter)
          .values({ baseRules, role: def.role, ...values })
          .onConflictDoUpdate({
            target: [characterRolesInCharacter.baseRules, characterRolesInCharacter.role],
            set: values,
          });
      }
      for (const def of registries.steps) {
        const values = {
          entityType: def.entityType,
          viaType: def.viaType,
          onDelete: def.onDelete,
          repeats: def.repeats,
        };
        await db
          .insert(stepsInCharacter)
          .values({ baseRules, step: def.step, ...values })
          .onConflictDoUpdate({ target: [stepsInCharacter.baseRules, stepsInCharacter.step], set: values });
      }
      if (registries.itemTypes.length > 0) {
        await db
          .insert(itemTypesInCharacter)
          .values(registries.itemTypes.map((entityType) => ({ baseRules, entityType })))
          .onConflictDoNothing();
      }
    }
  }

  /**
   * Writes every declaration into the registries and removes what none declares (`declared`: every registered
   * module's, by default), in one transaction: all of it, or none. The rows a changed declaration rewrites keep their
   * characters' last change (`arkyvree.registry_sync`, which `character.touch_characters` reads): nothing a player did
   * changed them.
   */
  static async reconcile(
    db: Db,
    declared: DeclaredRegistries = Engine.storages().map((storage) => ({
      baseRules: storage.baseRules,
      registries: storage.registries(),
    })),
  ) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('arkyvree.registry_sync', 'on', true)`);
      await StoredRegistries.writeEntityTypes(tx, declared);
      await StoredRegistries.writeLinkRoles(tx, declared);
      await StoredRegistries.writeFields(tx, declared);
      await StoredRegistries.writeOwnersRoles(tx, declared);
      await StoredRegistries.removeUndeclared(tx, declared);
    });
  }
}
