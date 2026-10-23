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

/** What the registries must hold: every registered module's base rules and declarations. */
export interface DeclaredRegistries {
  modules: string[];
  registries: StorageRegistries;
}

/** Postgres's code for a foreign key a delete would break. */
const FOREIGN_KEY_VIOLATION = "23503";

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
 * The registry tables, in the order their undeclared rows can go: a row that names another goes first (a type's
 * fields and roles before the type, an owned type before its owner).
 */
function registriesOf({ modules, registries }: DeclaredRegistries): Registry[] {
  return [
    {
      table: itemTypesInCharacter,
      columns: [itemTypesInCharacter.entityType],
      declared: registries.itemTypes.map((type) => [type]),
      name: ([type]) => `item type ${type}`,
    },
    {
      table: stepsInCharacter,
      columns: [stepsInCharacter.step],
      declared: registries.steps.map((def) => [def.step]),
      name: ([step]) => `step ${step}`,
    },
    {
      table: characterRolesInCharacter,
      columns: [characterRolesInCharacter.role],
      declared: registries.characterRoles.map((def) => [def.role]),
      name: ([role]) => `character role ${role}`,
    },
    {
      table: rulesetRolesInRules,
      columns: [rulesetRolesInRules.role],
      declared: registries.rulesetRoles.map((def) => [def.role]),
      name: ([role]) => `ruleset role ${role}`,
    },
    {
      table: fieldDefsInRules,
      columns: [fieldDefsInRules.ownerType, fieldDefsInRules.field],
      declared: registries.fieldDefs.map((def) => [def.ownerType, def.field]),
      name: ([ownerType, field]) => `field ${field} of ${ownerType}`,
    },
    {
      table: linkRolesInRules,
      columns: [linkRolesInRules.role, linkRolesInRules.fromType, linkRolesInRules.toType],
      declared: registries.linkRoles.map((def) => [def.role, def.fromType, def.toType]),
      name: ([role, fromType, toType]) => `link role ${role} from ${fromType} to ${toType}`,
    },
    {
      table: linkRoleKindsInRules,
      columns: [linkRoleKindsInRules.role, linkRoleKindsInRules.fromType],
      declared: registries.linkRoles.map((def) => [def.role, def.fromType]),
      name: ([role, fromType]) => `link role ${role} from ${fromType}`,
    },
    {
      table: entityTypesInRules,
      columns: [entityTypesInRules.type],
      declared: registries.entityTypes.map((def) => [def.type]),
      name: ([type]) => `entity type ${type}`,
      // Owned types first: their rows name their owners
      order: sql`${entityTypesInRules.ownerType} IS NULL`,
    },
    {
      table: modulesInRules,
      columns: [modulesInRules.baseRules],
      declared: modules.map((baseRules) => [baseRules]),
      name: ([baseRules]) => `module ${baseRules}`,
    },
  ];
}

/**
 * The registries as the database holds them, kept to what the registered modules declare
 * (`Engine.storage().registries()`): every migrate writes them (`scripts/db/migrate.ts`), so a module's new entity
 * type, field, link role or step is a code change only. A declaration that changed rewrites the rows that carry it (a
 * field that becomes a set, a role that becomes single: their foreign keys cascade), and the database refuses one its
 * rows can't take. A row no module declares any more goes, unless rows still use it: then the sync is refused, naming
 * it. Two modules can't declare one name: `StorageEngine` refuses it before anything is written.
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

  /** Writes the modules and their entity types: an owner before the types it owns, whose rows name it. */
  private static async writeEntityTypes(db: Db, { modules, registries }: DeclaredRegistries) {
    if (modules.length > 0) {
      await db
        .insert(modulesInRules)
        .values(modules.map((baseRules) => ({ baseRules })))
        .onConflictDoNothing();
    }
    const types = [...registries.entityTypes].sort(
      (a, b) => Number(a.ownerType !== null) - Number(b.ownerType !== null),
    );
    for (const def of types) {
      await db
        .insert(entityTypesInRules)
        .values({ type: def.type, ownerType: def.ownerType })
        .onConflictDoUpdate({ target: entityTypesInRules.type, set: { ownerType: def.ownerType } });
    }
  }

  /** Writes the fields: a change of kind or of set-ness rewrites the rows that hold the field. */
  private static async writeFields(db: Db, { registries }: DeclaredRegistries) {
    for (const def of registries.fieldDefs) {
      const values = {
        ownerKind: def.ownerKind,
        valueKind: def.valueKind,
        multiple: def.multiple,
        merge: def.merge,
        inheritsVia: def.inheritsVia,
      };
      await db
        .insert(fieldDefsInRules)
        .values({ ownerType: def.ownerType, field: def.field, ...values })
        .onConflictDoUpdate({ target: [fieldDefsInRules.ownerType, fieldDefsInRules.field], set: values });
    }
  }

  /**
   * Writes the link roles: first each role's single for its from-type, which its rows and its links carry (a change
   * rewrites them), then each role from a type to another.
   */
  private static async writeLinkRoles(db: Db, { registries }: DeclaredRegistries) {
    const kinds = new Map(registries.linkRoles.map((def) => [keyOf([def.role, def.fromType]), def]));
    for (const def of kinds.values()) {
      await db
        .insert(linkRoleKindsInRules)
        .values({ role: def.role, fromType: def.fromType, single: def.single })
        .onConflictDoUpdate({
          target: [linkRoleKindsInRules.role, linkRoleKindsInRules.fromType],
          set: { single: def.single },
        });
    }
    for (const def of registries.linkRoles) {
      const values = { viaType: def.viaType, onDelete: def.onDelete, viaOnDelete: def.viaOnDelete, merge: def.merge };
      await db
        .insert(linkRolesInRules)
        .values({ role: def.role, fromType: def.fromType, toType: def.toType, single: def.single, ...values })
        .onConflictDoUpdate({
          target: [linkRolesInRules.role, linkRolesInRules.fromType, linkRolesInRules.toType],
          set: values,
        });
    }
  }

  /** Writes a ruleset's roles, a character's, its advancements' steps and the types its items are. */
  private static async writeOwnersRoles(db: Db, { registries }: DeclaredRegistries) {
    for (const def of registries.rulesetRoles) {
      const values = { toType: def.toType, onDelete: def.onDelete };
      await db
        .insert(rulesetRolesInRules)
        .values({ role: def.role, ...values })
        .onConflictDoUpdate({ target: rulesetRolesInRules.role, set: values });
    }
    for (const def of registries.characterRoles) {
      const values = { entityType: def.entityType, single: def.single, onDelete: def.onDelete };
      await db
        .insert(characterRolesInCharacter)
        .values({ role: def.role, ...values })
        .onConflictDoUpdate({ target: characterRolesInCharacter.role, set: values });
    }
    for (const def of registries.steps) {
      const values = { entityType: def.entityType, viaType: def.viaType, onDelete: def.onDelete, repeats: def.repeats };
      await db
        .insert(stepsInCharacter)
        .values({ step: def.step, ...values })
        .onConflictDoUpdate({ target: stepsInCharacter.step, set: values });
    }
    if (registries.itemTypes.length > 0) {
      await db
        .insert(itemTypesInCharacter)
        .values(registries.itemTypes.map((entityType) => ({ entityType })))
        .onConflictDoNothing();
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
    declared: DeclaredRegistries = { modules: Engine.storage().modules(), registries: Engine.storage().registries() },
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
