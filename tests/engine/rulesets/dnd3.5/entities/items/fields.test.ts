import { describe, expect, test } from "bun:test";

import { and, eq, isNull } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import { db } from "@/server/database/index.ts";
import { Items, Properties } from "@/server/repositories/index.ts";
import {
  DAMAGE_TYPE,
  ITEM_HAS_CHARGES,
  WEAPON_FINESSABLE,
  WEAPON_RANGE,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** Rows as a sorted list of `type=value`: a multiset. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("An item's fields", () => {
  test("are none without their properties, and as stored with them: a flag false, a list in its rows' order", () => {
    expect(ITEM_FIELDS.read([])).toEqual(ITEM_FIELDS.defaults);
    const fields = ITEM_FIELDS.read([
      { type: ITEM_HAS_CHARGES, value: "40" },
      { type: WEAPON_FINESSABLE, value: "false" },
      { type: WEAPON_RANGE, value: "10" },
      { type: DAMAGE_TYPE, value: "Piercing" },
      { type: DAMAGE_TYPE, value: "Slashing" },
      { type: "SOMETHING_ELSE", value: "1" },
    ]);
    expect(fields.weapon).toMatchObject({ finessable: false, range: 10, damageTypes: ["Piercing", "Slashing"] });
    expect(fields.charges).toBe(40);
    expect(fields.weapon.criticalRange).toBeNull();
  });

  test("of every seeded item rebuild its rows: its own, and merged with its template's", async () => {
    const itemIds = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(and(eq(entitiesInRules.type, "items"), isNull(entitiesInRules.deletedAt)));
    const ids = itemIds.map(({ id }) => id);
    const sources = new Map((await Items.findMany(db, { ids })).map((item) => [item.id, item.sourceItemId]));
    const rows = (await Properties.findMany(db, { entityIds: ids, entityType: "items" })).map((property) => ({
      itemId: property.entityId,
      sourceItemId: sources.get(property.entityId) ?? null,
      type: property.type,
      value: property.value,
    }));
    const rowsByItem = Map.groupBy(rows, (row) => row.itemId);
    expect(rows.every((row) => ITEM_FIELDS.types.includes(row.type))).toBe(true);
    expect(rowsByItem.size).toBeGreaterThan(400);

    const mismatches: string[] = [];
    for (const [itemId, own] of rowsByItem) {
      const ownTypes = new Set(own.map((row) => row.type));
      const sourceItemId = own[0].sourceItemId;
      const template = sourceItemId ? (rowsByItem.get(sourceItemId) ?? []).filter((r) => !ownTypes.has(r.type)) : [];
      for (const stored of [own, [...template, ...own]]) {
        const rebuilt = ITEM_FIELDS.toProperties(ITEM_FIELDS.read(stored));
        if (multiset(rebuilt).join("|") !== multiset(stored).join("|")) mismatches.push(itemId);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
