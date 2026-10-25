import { describe, expect, test } from "bun:test";

import { and, eq, isNull } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Properties } from "@/server/repositories/index.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
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
  test("are none without their values, and as stored with them: a flag false, a list in its values' order", () => {
    expect(ITEM_FIELDS.read(OwnerValues.NONE)).toEqual(ITEM_FIELDS.defaults);
    const fields = ITEM_FIELDS.read(
      storedValues([
        [ITEM_HAS_CHARGES, 40],
        [WEAPON_FINESSABLE, false],
        [WEAPON_RANGE, 10],
        [DAMAGE_TYPE, "Piercing"],
        [DAMAGE_TYPE, "Slashing"],
        ["SOMETHING_ELSE", 1],
      ]),
    );
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
    const sources = new Map(
      (await Entities.findMany<Item>(db, { entityType: "items", ids })).map((item) => [item.id, item.sourceItemId]),
    );
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
        const rebuilt = ITEM_FIELDS.toProperties(ITEM_FIELDS.read(ITEM_FIELDS.storedOf(stored)));
        if (multiset(rebuilt).join("|") !== multiset(stored).join("|")) mismatches.push(itemId);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
