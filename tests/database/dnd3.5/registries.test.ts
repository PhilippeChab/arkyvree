import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { Engine, type StorageRegistries } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import StoredRegistries, { type DeclaredRegistries } from "@/server/repositories/stored/StoredRegistries.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** A made-up module's base rules, beside 3.5's. */
const SECOND = "Second rules" as BaseRules;

/** Every module's declarations, as the sync writes them by default, changed by `change` (3.5's, by default). */
function declared(change: (registries: StorageRegistries) => void = () => undefined): DeclaredRegistries {
  return Engine.storages().map((storage) => {
    const registries = structuredClone(storage.registries());
    if (storage.baseRules === DND35_BASE_RULES) change(registries);
    return { baseRules: storage.baseRules, registries };
  });
}

/** Each module's declared rows a registry holds (`pick`, each as its columns), its base rules first. */
function declaredRows<T>(pick: (registries: StorageRegistries) => readonly T[], row: (def: T) => object) {
  return linesOf(
    Engine.storages().flatMap((storage) =>
      pick(storage.registries()).map((def) => ({ baseRules: storage.baseRules, ...row(def) })),
    ),
  );
}

/**
 * Every module's declarations, and a made-up module's beside them (`SECOND`): 3.5's, of the same names, changed by
 * `change`.
 */
function declaredWithSecond(change: (registries: StorageRegistries) => void): DeclaredRegistries {
  const registries = structuredClone(Engine.storage(DND35_BASE_RULES).registries());
  change(registries);
  return [...declared(), { baseRules: SECOND, registries }];
}

/** Declared rows as the database's would read: each as one line of its columns, sorted. */
function linesOf(rows: Record<string, unknown>[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
}

/** The count a query answers (its `n`). */
async function countOf(query: ReturnType<typeof sql>) {
  const [row] = (await db.execute<{ n: number }>(query)).rows;
  return Number(row.n);
}

/** The error a statement (`run`) is refused with, in a savepoint, which the refusal rolls back alone. */
async function refusalOf(run: (tx: Db) => Promise<unknown>) {
  return await db.transaction(run).catch((error: unknown) => error);
}

/** Every registry's rows, each as one line of its table and columns, sorted. */
async function registriesRows() {
  const tables = [
    "rules.modules",
    "rules.entity_types",
    "rules.link_role_kinds",
    "rules.link_roles",
    "rules.field_defs",
    "rules.ruleset_roles",
    "character.character_roles",
    "character.steps",
    "character.item_types",
  ];
  const rows = await Promise.all(
    tables.map(async (table) => (await rowsOf(sql`SELECT * FROM ${sql.raw(table)}`)).map((row) => `${table} ${row}`)),
  );
  return rows.flat().sort();
}

/** A registry's rows, each as one line of its columns, sorted: what's compared, whatever order either keeps. */
async function rowsOf(query: ReturnType<typeof sql>) {
  return (await db.execute<Record<string, unknown>>(query)).rows.map((row) => JSON.stringify(row)).sort();
}

describe("The registries, which the generic tables' rows are checked against", () => {
  test("hold the entity types every module declares, each of its base rules", async () => {
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", type, owner_type AS "ownerType" FROM rules.entity_types`),
    ).toEqual(
      declaredRows(
        (registries) => registries.entityTypes,
        ({ type, ownerType }) => ({ type, ownerType }),
      ),
    );
  });

  test("hold the link roles every module declares, each single or not for its from-type", async () => {
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", role, from_type AS "fromType", to_type AS "toType",
        via_type AS "viaType", single, on_delete AS "onDelete", via_on_delete AS "viaOnDelete" FROM rules.link_roles`),
    ).toEqual(
      declaredRows(
        (registries) => registries.linkRoles,
        ({ role, fromType, toType, viaType, single, onDelete, viaOnDelete }) => ({
          role,
          fromType,
          toType,
          viaType,
          single,
          onDelete,
          viaOnDelete,
        }),
      ),
    );
    expect(
      await rowsOf(
        sql`SELECT base_rules AS "baseRules", role, from_type AS "fromType", single FROM rules.link_role_kinds`,
      ),
    ).toEqual(
      declaredRows(
        (registries) => [...new Map(registries.linkRoles.map((def) => [`${def.role}:${def.fromType}`, def])).values()],
        ({ role, fromType, single }) => ({ role, fromType, single }),
      ),
    );
  });

  test("hold the fields every module declares, their kinds and sets", async () => {
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", owner_kind AS "ownerKind", owner_type AS "ownerType", field,
        value_kind AS "valueKind", multiple FROM rules.field_defs`),
    ).toEqual(
      declaredRows(
        (registries) => registries.fieldDefs,
        ({ ownerKind, ownerType, field, valueKind, multiple }) => ({
          ownerKind,
          ownerType,
          field,
          valueKind,
          multiple,
        }),
      ),
    );
  });

  test("hold the ruleset and character roles, the steps and the item types every module declares", async () => {
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", role, to_type AS "toType", on_delete AS "onDelete"
        FROM rules.ruleset_roles`),
    ).toEqual(
      declaredRows(
        (registries) => registries.rulesetRoles,
        ({ role, toType, onDelete }) => ({ role, toType, onDelete }),
      ),
    );
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", role, entity_type AS "entityType", single,
        on_delete AS "onDelete" FROM character.character_roles`),
    ).toEqual(
      declaredRows(
        (registries) => registries.characterRoles,
        ({ role, entityType, single, onDelete }) => ({ role, entityType, single, onDelete }),
      ),
    );
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", step, entity_type AS "entityType", via_type AS "viaType",
        on_delete AS "onDelete", repeats FROM character.steps`),
    ).toEqual(
      declaredRows(
        (registries) => registries.steps,
        ({ step, entityType, viaType, onDelete, repeats }) => ({ step, entityType, viaType, onDelete, repeats }),
      ),
    );
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules", entity_type AS "entityType" FROM character.item_types`),
    ).toEqual(
      declaredRows(
        (registries) => registries.itemTypes,
        (entityType) => ({ entityType }),
      ),
    );
  });

  test("are each keyed by base rules first, and so is every key into one", async () => {
    const keys = await db.execute<{ first: string; name: string }>(sql`
      SELECT c.conname AS name, a.attname AS first FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.connamespace IN ('rules'::regnamespace, 'character'::regnamespace)
        AND (
          (c.contype = 'p' AND c.conrelid IN (
            'rules.entity_types'::regclass, 'rules.field_defs'::regclass, 'rules.link_role_kinds'::regclass,
            'rules.link_roles'::regclass, 'rules.ruleset_roles'::regclass, 'character.character_roles'::regclass,
            'character.steps'::regclass, 'character.item_types'::regclass))
          OR (c.contype = 'f' AND c.confrelid IN (
            'rules.entity_types'::regclass, 'rules.field_defs'::regclass, 'rules.link_role_kinds'::regclass,
            'rules.link_roles'::regclass, 'rules.ruleset_roles'::regclass, 'character.character_roles'::regclass,
            'character.steps'::regclass, 'character.item_types'::regclass))
        )
      ORDER BY c.conname`);
    expect(keys.rows.length).toBeGreaterThan(30);
    expect(keys.rows.filter((key) => key.first !== "base_rules").map((key) => key.name)).toEqual([]);
  });
});

describe("The keys drizzle-kit doesn't record, which a generated migration would lose", () => {
  test("every reference that doesn't own its row is checked at commit: deferrable, initially deferred", async () => {
    const keys = await db.execute<{ name: string }>(sql`
      SELECT conname AS name FROM pg_constraint
      WHERE contype = 'f' AND condeferrable AND condeferred AND connamespace IN ('rules'::regnamespace, 'character'::regnamespace)
      ORDER BY conname`);
    expect(keys.rows.map((row) => row.name)).toEqual([
      "advancement_picks_entity_id_entity_type_fkey",
      "advancement_picks_via_id_via_type_fkey",
      "advancements_entry_id_entry_type_fkey",
      "entity_links_to_id_to_type_fkey",
      "entity_links_via_id_via_type_fkey",
      "inventory_item_entity_fkey",
      "links_entity_id_entity_type_fkey",
      "ruleset_links_to_id_to_type_fkey",
    ]);
  });

  test("an optional pair is matched in full: an id without its type is refused", async () => {
    const keys = await db.execute<{ name: string }>(sql`
      SELECT conname AS name FROM pg_constraint
      WHERE contype = 'f' AND confmatchtype = 'f' AND connamespace IN ('rules'::regnamespace, 'character'::regnamespace)
      ORDER BY conname`);
    expect(keys.rows.map((row) => row.name)).toEqual([
      "advancement_picks_entity_id_entity_type_fkey",
      "advancement_picks_via_id_via_type_fkey",
      "entities_owner_id_owner_type_fkey",
      "entity_links_via_id_via_type_fkey",
    ]);
  });
});

describe("The registry sync, which every migrate runs", () => {
  test("leaves registries that already hold every declaration as they are", async () => {
    const before = await registriesRows();
    expect(before.length).toBeGreaterThan(0);
    await StoredRegistries.reconcile(db);
    expect(await registriesRows()).toEqual(before);
  });

  test("writes a new declaration, and removes it once no module declares it", async () => {
    const withField = declared((registries) => {
      registries.fieldDefs.push({
        ownerType: "feats",
        ownerKind: "entity",
        field: "FEAT_SYNC_TEST",
        valueKind: "text",
        multiple: false,
      });
    });
    await StoredRegistries.reconcile(db, withField);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.field_defs WHERE field = 'FEAT_SYNC_TEST'`)).toBe(1);

    await StoredRegistries.reconcile(db);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.field_defs WHERE field = 'FEAT_SYNC_TEST'`)).toBe(0);
  });

  test("rewrites the rows a changed declaration carries", async () => {
    const many = declared((registries) => {
      for (const def of registries.linkRoles) if (def.role === "resistedBy") def.single = false;
    });
    await StoredRegistries.reconcile(db, many);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.entity_links WHERE role = 'resistedBy' AND single`)).toBe(
      0,
    );
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.entity_links WHERE role = 'resistedBy'`)).toBeGreaterThan(
      0,
    );

    await StoredRegistries.reconcile(db);
    expect(
      await countOf(sql`SELECT count(*) AS n FROM rules.entity_links WHERE role = 'resistedBy' AND NOT single`),
    ).toBe(0);
  });

  test("refuses to remove a declaration rows still use, naming it", async () => {
    const without = declared((registries) => {
      registries.fieldDefs = registries.fieldDefs.filter((def) => def.field !== "SPELL_SCHOOL");
    });
    expect(StoredRegistries.reconcile(db, without)).rejects.toThrow(
      `No module declares the field SPELL_SCHOOL of spells of ${DND35_BASE_RULES} any more, but rows still use it`,
    );
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.field_defs WHERE field = 'SPELL_SCHOOL'`)).toBe(1);
  });

  test("keeps a character's last change when a declaration rewrites its rows", async () => {
    const [character] = (
      await db.execute<{ id: string; last_changed_at: string }>(sql`
        SELECT c.id, c.last_changed_at::text FROM character.characters c
        JOIN character.advancements a ON a.character_id = c.id
        JOIN character.advancement_picks p ON p.advancement_id = a.id AND p.step = 'hp'
        LIMIT 1`)
    ).rows;
    expect(character).toBeDefined();
    const repeating = declared((registries) => {
      for (const def of registries.steps) if (def.step === "hp") def.repeats = true;
    });
    await StoredRegistries.reconcile(db, repeating);
    expect(
      await countOf(sql`SELECT count(*) AS n FROM character.advancement_picks WHERE step = 'hp' AND NOT repeats`),
    ).toBe(0);
    const [after] = (
      await db.execute<{ last_changed_at: string }>(
        sql`SELECT last_changed_at::text FROM character.characters WHERE id = ${character.id}`,
      )
    ).rows;
    expect(after.last_changed_at).toBe(character.last_changed_at);
  });
});

describe("Two modules declaring one name, each its own", () => {
  test("hold each one's rows apart, and the sync removes a module no longer registered", async () => {
    await StoredRegistries.reconcile(
      db,
      declaredWithSecond((registries) => {
        registries.fieldDefs.push({
          ownerType: "feats",
          ownerKind: "entity",
          field: "FEAT_SECOND_ONLY",
          valueKind: "text",
          multiple: false,
        });
      }),
    );
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.entity_types WHERE type = 'feats'`)).toBe(2);
    expect(
      await rowsOf(sql`SELECT base_rules AS "baseRules" FROM rules.field_defs WHERE field = 'FEAT_SECOND_ONLY'`),
    ).toEqual(linesOf([{ baseRules: SECOND }]));

    await StoredRegistries.reconcile(db);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.modules WHERE base_rules = ${SECOND}`)).toBe(0);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.entity_types WHERE type = 'feats'`)).toBe(1);
  });

  test("refuses a 3.5 feat the other's field, and a row whose base rules aren't its entity's or its ruleset's", async () => {
    await StoredRegistries.reconcile(
      db,
      declaredWithSecond((registries) => {
        registries.fieldDefs.push({
          ownerType: "feats",
          ownerKind: "entity",
          field: "FEAT_SECOND_ONLY",
          valueKind: "text",
          multiple: false,
        });
      }),
    );
    const [feat] = (
      await db.execute<{ id: string; ruleset_id: string }>(
        sql`SELECT id, ruleset_id FROM rules.entities WHERE type = 'feats' AND base_rules = ${DND35_BASE_RULES} LIMIT 1`,
      )
    ).rows;
    const field = (baseRules: BaseRules) => (tx: Db) =>
      tx.execute(sql`INSERT INTO rules.entity_fields
        (base_rules, entity_id, entity_type, field, ordinal, value_kind, multiple, text_value)
        VALUES (${baseRules}, ${feat.id}, 'feats', 'FEAT_SECOND_ONLY', 0, 'text', false, 'x')`);
    expect(await refusalOf(field(DND35_BASE_RULES))).toMatchObject({
      cause: { code: "23503", constraint: "entity_fields_entity_type_field_value_kind_multiple_fkey" },
    });
    expect(await refusalOf(field(SECOND))).toMatchObject({
      cause: { code: "23503", constraint: "entity_fields_entity_id_base_rules_fkey" },
    });
    expect(
      await refusalOf((tx) =>
        tx.execute(sql`INSERT INTO rules.entities (base_rules, ruleset_id, type, name, partition)
          VALUES (${SECOND}, ${feat.ruleset_id}, 'feats', 'Second Feat', '')`),
      ),
    ).toMatchObject({ cause: { code: "23503", constraint: "entities_ruleset_id_fkey" } });
  });

  test("a delete applies the deleted entity's own base rules' roles, not the other's of one name", async () => {
    // 3.5 unlinks a class's skill whose skill goes; the other module would delete the class
    await StoredRegistries.reconcile(
      db,
      declaredWithSecond((registries) => {
        for (const def of registries.linkRoles) if (def.role === "classSkill") def.onDelete = "delete";
      }),
    );
    const [link] = (
      await db.execute<{ from_id: string; to_id: string }>(
        sql`SELECT from_id, to_id FROM rules.entity_links WHERE role = 'classSkill' LIMIT 1`,
      )
    ).rows;
    await db.execute(sql`DELETE FROM rules.entities WHERE id = ${link.to_id}`);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.entities WHERE id = ${link.from_id}`)).toBe(1);
    expect(
      await countOf(sql`SELECT count(*) AS n FROM rules.entity_links WHERE from_id = ${link.from_id}
        AND to_id = ${link.to_id}`),
    ).toBe(0);
  });
});
