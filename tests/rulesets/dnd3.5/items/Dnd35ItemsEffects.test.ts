import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { Dnd35ItemsEffects } from "@/server/rulesets/dnd3.5/items/Dnd35ItemsEffects.ts";
import { Dnd35ItemsRules } from "@/server/rulesets/dnd3.5/items/Dnd35ItemsRules.ts";
import { NO_ITEM_FIELDS, NO_WEAPON_FIELDS } from "@/server/rulesets/dnd3.5/items/itemFields.ts";
import { createTestItem } from "@/tests/support/items.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

async function readItem(itemId: string) {
  return await Properties.findMany(db, { entityIds: [itemId], entityType: "items" });
}

describe("An item's effects", () => {
  test("store its fields as its properties, in place of those they stored, and keep its others", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const item = await createTestItem({ rulesetId: ruleset.id }, { SOMETHING_ELSE: "1" });
    const effects = new Dnd35ItemsEffects();
    const rules = new Dnd35ItemsRules();
    const fields = {
      ...NO_ITEM_FIELDS,
      masterwork: true,
      weapon: { ...NO_WEAPON_FIELDS, damageTypes: ["Piercing", "Slashing"], finessable: false, proficiency: "Martial" },
    };

    await effects.syncProperties(db, item.id, fields);
    expect(rules.readProperties(await readItem(item.id))).toEqual(fields);

    await effects.syncProperties(db, item.id, { ...NO_ITEM_FIELDS, magicAuras: ["Faint evocation"] });
    const properties = await readItem(item.id);
    expect(rules.readProperties(properties)).toEqual({ ...NO_ITEM_FIELDS, magicAuras: ["Faint evocation"] });
    expect(properties.map((property) => property.type).toSorted()).toEqual(["MAGIC_AURA", "SOMETHING_ELSE"]);
  });
});
