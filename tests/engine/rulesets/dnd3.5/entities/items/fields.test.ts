import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import Field from "@/engine/core/fields/Field.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import { Engine } from "@/engine/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { heldValues, listValues, writtenValues } from "@/tests/support/ownerValues.ts";
import { DAMAGE_TYPE, ITEM_HAS_CHARGES, WEAPON_FINESSABLE, WEAPON_RANGE } from "@/vocabulary/dnd3.5/fields/index.ts";

describe("An item's fields", () => {
  test("are none without their values, and as stored with them: a flag false, a list in its values' order", () => {
    expect(ITEM_FIELDS.read(OwnerValues.NONE)).toEqual(ITEM_FIELDS.defaults);
    const fields = ITEM_FIELDS.read(
      heldValues([
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

  test("of every seeded item rebuild its fields: its own, and with its template's it reads off it", async () => {
    const itemIds = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.type, "items"));
    const items = new Map(
      (await Entities.findMany<Item>(db, { entityType: "items", ids: itemIds.map(({ id }) => id) })).map((item) => [
        item.id,
        item,
      ]),
    );
    const declared = new Set(Field.storedLeavesOf(ITEM_FIELDS.fields).map((leaf) => leaf.field));
    const held = [...items.values()];
    expect(held.every((item) => Object.keys(item.fields).every((field) => declared.has(field)))).toBe(true);
    expect(held.filter((item) => Object.keys(item.fields).length > 2).length).toBeGreaterThan(400);

    const inherited = Engine.storage().declaredFields().inheritance("items")!;
    const mismatches: string[] = [];
    for (const item of held) {
      const template = item.links.madeFrom ? items.get(item.links.madeFrom) : undefined;
      const own = { fields: item.fields, links: {} };
      const whole = template && {
        fields: OwnerValues.inherit(item.fields, template.fields, inherited.fields),
        links: {},
      };
      for (const stored of [own, whole ?? own]) {
        const rebuilt = writtenValues(ITEM_FIELDS.write(ITEM_FIELDS.read(stored)));
        if (listValues(rebuilt).join("|") !== listValues(stored).join("|")) mismatches.push(item.id);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
