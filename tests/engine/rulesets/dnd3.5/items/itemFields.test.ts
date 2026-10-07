import { describe, expect, test } from "bun:test";

import { and, eq, isNull } from "drizzle-orm";

import { itemsInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import {
  ITEM_FIELD_PROPERTY_TYPES,
  NO_ITEM_FIELDS,
  readItemFields,
  toItemProperties,
} from "@/engine/rulesets/dnd3.5/items/itemFields.ts";
import { db } from "@/server/database/index.ts";
import { DAMAGE_TYPE, ITEM_HAS_CHARGES, WEAPON_FINESSABLE, WEAPON_RANGE } from "@/shared/dnd3.5/properties/index.ts";

/** Rows as a sorted list of `type=value`: a multiset. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("An item's fields", () => {
  test("are none without their properties, and as stored with them: a flag false, a list in its rows' order", () => {
    expect(readItemFields([])).toEqual(NO_ITEM_FIELDS);
    const fields = readItemFields([
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
    const rows = await db
      .select({
        itemId: itemsInRules.id,
        sourceItemId: itemsInRules.sourceItemId,
        type: propertiesInCustomization.type,
        value: propertiesInCustomization.value,
      })
      .from(propertiesInCustomization)
      .innerJoin(itemsInRules, eq(itemsInRules.id, propertiesInCustomization.entityId))
      .where(and(eq(propertiesInCustomization.entityType, "items"), isNull(itemsInRules.deletedAt)));
    const rowsByItem = Map.groupBy(rows, (row) => row.itemId);
    expect(rows.every((row) => ITEM_FIELD_PROPERTY_TYPES.includes(row.type))).toBe(true);
    expect(rowsByItem.size).toBeGreaterThan(400);

    const mismatches: string[] = [];
    for (const [itemId, own] of rowsByItem) {
      const ownTypes = new Set(own.map((row) => row.type));
      const sourceItemId = own[0].sourceItemId;
      const template = sourceItemId ? (rowsByItem.get(sourceItemId) ?? []).filter((r) => !ownTypes.has(r.type)) : [];
      for (const stored of [own, [...template, ...own]]) {
        const rebuilt = toItemProperties(readItemFields(stored));
        if (multiset(rebuilt).join("|") !== multiset(stored).join("|")) mismatches.push(itemId);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
