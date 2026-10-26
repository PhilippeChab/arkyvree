import { eq } from "drizzle-orm";

import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { Engine, type EntityWrite, type FieldValue, type ViewKinds } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, Entities, Fields } from "@/server/repositories/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import { invalidateSeededRuleset } from "./rulesets.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/** An item, as the view registers it. */
type Item = ViewKinds["items"];

/** An inventory entry a test gives a character: a seeded item by its name, or an item's id, equipped by default. */
export interface Carried {
  equipped?: boolean;
  groups?: number[];
  item: string;
  location?: ItemLocation;
  quantity?: number;
}

/** Replaces the character's inventory with these entries (`Carried`): seeded items by name, or item ids. */
export async function carry(character: Pick<Character, "id">, carried: Carried[]) {
  const { itemMap } = await getSeedCtx();
  await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
  await CharacterInventory.createMany(
    db,
    carried.map(({ item, equipped = true, quantity = 1, ...rest }) => ({
      characterId: character.id,
      itemId: itemMap[item] ?? item,
      equipped,
      quantity,
      ...rest,
    })),
  );
}

/**
 * A new item of the seeded ruleset (or `values.rulesetId`), with these stored fields' values (`fields`, a value each,
 * by field: the kind's own written with it, the others after). Its ruleset's cached rules are dropped, so what it reads
 * next sees the item.
 */
export async function createTestItem(values: EntityWrite = {}, fields: Record<string, FieldValue> = {}) {
  const rulesetId = values.rulesetId ?? (await getSeedCtx()).rulesetId;
  const own = Engine.storage().kind("items").fields ?? {};
  const entries = Object.entries(fields);
  const [item] = await Entities.create<Item>(db, "items", {
    name: `Test Item ${uniqueId()}`,
    ...values,
    fields: { ...values.fields, ...Object.fromEntries(entries.filter(([field]) => field in own)) },
    rulesetId,
  });
  const written = Object.fromEntries(
    entries.filter(([field]) => !(field in own)).map(([field, value]) => [field, [value]]),
  );
  await Fields.update(db, [{ id: item.id, type: "items", values: { fields: written, links: {} } }]);
  invalidateSeededRuleset(rulesetId);
  return item;
}
