import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { Engine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";

/** A registry's rows, each as one line of its columns, sorted: what's compared, whatever order either keeps. */
async function rowsOf(query: ReturnType<typeof sql>) {
  return (await db.execute<Record<string, unknown>>(query)).rows.map((row) => JSON.stringify(row)).sort();
}

/** Declared rows as the database's would read: each as one line of its columns, sorted. */
function linesOf(rows: Record<string, unknown>[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
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
        on_delete AS "onDelete", via_on_delete AS "viaOnDelete", merge FROM rules.link_roles`),
    ).toEqual(
      linesOf(
        registries.linkRoles.map(({ role, fromType, toType, viaType, single, onDelete, viaOnDelete, merge }) => ({
          role,
          fromType,
          toType,
          viaType,
          single,
          onDelete,
          viaOnDelete,
          merge,
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

  test("hold the fields every module declares, their kinds, sets, merges and inheritance", async () => {
    expect(
      await rowsOf(sql`SELECT owner_kind AS "ownerKind", owner_type AS "ownerType", field, value_kind AS "valueKind",
        multiple, merge, inherits_via AS "inheritsVia" FROM rules.field_defs`),
    ).toEqual(
      linesOf(
        registries.fieldDefs.map(({ ownerKind, ownerType, field, valueKind, multiple, merge, inheritsVia }) => ({
          ownerKind,
          ownerType,
          field,
          valueKind,
          multiple,
          merge,
          inheritsVia,
        })),
      ),
    );
  });

  test("hold the ruleset and character roles, the steps and the item types every module declares", async () => {
    expect(await rowsOf(sql`SELECT role, to_type AS "toType", on_delete AS "onDelete" FROM rules.ruleset_roles`)).toEqual(
      linesOf(registries.rulesetRoles.map(({ role, toType, onDelete }) => ({ role, toType, onDelete }))),
    );
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
      "advancements_track_id_track_type_fkey",
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
      "advancements_track_id_track_type_fkey",
      "entities_owner_id_owner_type_fkey",
      "entity_links_via_id_via_type_fkey",
    ]);
  });
});
