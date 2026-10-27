import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { Engine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import StoredRegistries, { type DeclaredRegistries } from "@/server/repositories/stored/StoredRegistries.ts";

/** Every module's declarations, as the sync writes them by default. */
function declared(): DeclaredRegistries {
  return { modules: Engine.storage().modules(), registries: structuredClone(Engine.storage().registries()) };
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
  const registries = Engine.storage().registries();

  test("hold the entity types every module declares", async () => {
    expect(await rowsOf(sql`SELECT type, owner_type AS "ownerType" FROM rules.entity_types`)).toEqual(
      linesOf(registries.entityTypes.map(({ type, ownerType }) => ({ type, ownerType }))),
    );
  });

  test("hold the link roles every module declares, each single or not for its from-type", async () => {
    expect(
      await rowsOf(sql`SELECT role, from_type AS "fromType", to_type AS "toType", via_type AS "viaType", single,
        on_delete AS "onDelete", via_on_delete AS "viaOnDelete" FROM rules.link_roles`),
    ).toEqual(
      linesOf(
        registries.linkRoles.map(({ role, fromType, toType, viaType, single, onDelete, viaOnDelete }) => ({
          role,
          fromType,
          toType,
          viaType,
          single,
          onDelete,
          viaOnDelete,
        })),
      ),
    );
    expect(await rowsOf(sql`SELECT role, from_type AS "fromType", single FROM rules.link_role_kinds`)).toEqual(
      linesOf([
        ...new Map(
          registries.linkRoles.map(({ role, fromType, single }) => [`${role}:${fromType}`, { role, fromType, single }]),
        ).values(),
      ]),
    );
  });

  test("hold the fields every module declares, their kinds and sets", async () => {
    expect(
      await rowsOf(sql`SELECT owner_kind AS "ownerKind", owner_type AS "ownerType", field, value_kind AS "valueKind",
        multiple FROM rules.field_defs`),
    ).toEqual(
      linesOf(
        registries.fieldDefs.map(({ ownerKind, ownerType, field, valueKind, multiple }) => ({
          ownerKind,
          ownerType,
          field,
          valueKind,
          multiple,
        })),
      ),
    );
  });

  test("hold the ruleset and character roles, the steps and the item types every module declares", async () => {
    expect(
      await rowsOf(sql`SELECT role, to_type AS "toType", on_delete AS "onDelete" FROM rules.ruleset_roles`),
    ).toEqual(linesOf(registries.rulesetRoles.map(({ role, toType, onDelete }) => ({ role, toType, onDelete }))));
    expect(
      await rowsOf(sql`SELECT role, entity_type AS "entityType", single, on_delete AS "onDelete"
        FROM character.character_roles`),
    ).toEqual(
      linesOf(
        registries.characterRoles.map(({ role, entityType, single, onDelete }) => ({
          role,
          entityType,
          single,
          onDelete,
        })),
      ),
    );
    expect(
      await rowsOf(sql`SELECT step, entity_type AS "entityType", via_type AS "viaType", on_delete AS "onDelete", repeats
        FROM character.steps`),
    ).toEqual(
      linesOf(
        registries.steps.map(({ step, entityType, viaType, onDelete, repeats }) => ({
          step,
          entityType,
          viaType,
          onDelete,
          repeats,
        })),
      ),
    );
    expect(await rowsOf(sql`SELECT entity_type AS "entityType" FROM character.item_types`)).toEqual(
      linesOf(registries.itemTypes.map((entityType) => ({ entityType }))),
    );
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
      "advancements_entry_id_entry_type_fkey",
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
    const withField = declared();
    withField.registries.fieldDefs.push({
      ownerType: "feats",
      ownerKind: "entity",
      field: "FEAT_SYNC_TEST",
      valueKind: "text",
      multiple: false,
    });
    await StoredRegistries.reconcile(db, withField);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.field_defs WHERE field = 'FEAT_SYNC_TEST'`)).toBe(1);

    await StoredRegistries.reconcile(db);
    expect(await countOf(sql`SELECT count(*) AS n FROM rules.field_defs WHERE field = 'FEAT_SYNC_TEST'`)).toBe(0);
  });

  test("rewrites the rows a changed declaration carries", async () => {
    const many = declared();
    for (const def of many.registries.linkRoles) if (def.role === "resistedBy") def.single = false;
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
    const without = declared();
    without.registries.fieldDefs = without.registries.fieldDefs.filter((def) => def.field !== "SPELL_SCHOOL");
    expect(StoredRegistries.reconcile(db, without)).rejects.toThrow(
      "No module declares the field SPELL_SCHOOL of spells any more, but rows still use it",
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
    const repeating = declared();
    for (const def of repeating.registries.steps) if (def.step === "hp") def.repeats = true;
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
