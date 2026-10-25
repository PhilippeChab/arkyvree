import { describe, expect, test } from "bun:test";

import { and, eq, isNull } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import Field from "@/engine/core/fields/Field.ts";
import { OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Fields } from "@/server/repositories/index.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import {
  DAMAGE_TYPE,
  ITEM_HAS_CHARGES,
  WEAPON_FINESSABLE,
  WEAPON_RANGE,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** Stored values as a sorted list of `field=value`: a multiset. */
function multiset({ fields }: StoredValues) {
  return Object.entries(fields)
    .flatMap(([field, values]) => values.map((value) => `${field}=${value}`))
    .toSorted();
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

  test("of every seeded item rebuild its stored values: its own, and merged with its template's", async () => {
    const itemIds = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(and(eq(entitiesInRules.type, "items"), isNull(entitiesInRules.deletedAt)));
    const ids = itemIds.map(({ id }) => id);
    const sources = new Map(
      (await Entities.findMany<Item>(db, { entityType: "items", ids })).map((item) => [item.id, item.sourceItemId]),
    );
    const values = await Fields.findMany(db, { ownerIds: ids, ownerType: "items" });
    const held = [...values].filter(([, stored]) => Object.keys(stored.fields).length > 0);
    const declared = new Set(
      Field.leavesOf(ITEM_FIELDS.fields).flatMap((leaf) => (leaf.kind === "ref" ? [] : [leaf.field])),
    );
    expect(held.every(([, stored]) => Object.keys(stored.fields).every((field) => declared.has(field)))).toBe(true);
    expect(held.length).toBeGreaterThan(400);

    const mismatches: string[] = [];
    for (const [itemId, own] of held) {
      const sourceItemId = sources.get(itemId);
      const template = sourceItemId ? values.get(sourceItemId) : undefined;
      for (const stored of [own, template ? OwnerValues.inherit(own, template) : own]) {
        const rebuilt = OwnerValues.written(ITEM_FIELDS.write(ITEM_FIELDS.read(stored)));
        if (multiset(rebuilt).join("|") !== multiset(stored).join("|")) mismatches.push(itemId);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
