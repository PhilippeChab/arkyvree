import { eq } from "drizzle-orm";

import { inventoryInCharacter } from "@/drizzle/schema.ts";
import type { ViewEntities } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, Entities, Properties } from "@/server/repositories/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import { invalidateSeededRuleset } from "./rulesets.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/** An item, as the view registers it. */
type Item = ViewEntities["items"];

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
 * A new item of the seeded ruleset (or `values.rulesetId`), with these properties. Its ruleset's cached rules are
 * dropped, so what it reads next sees the item.
 */
export async function createTestItem(values: Partial<Item> = {}, properties: Record<string, string> = {}) {
  const rulesetId = values.rulesetId ?? (await getSeedCtx()).rulesetId;
  const [item] = await Entities.create<Item>(db, "items", { name: `Test Item ${uniqueId()}`, ...values, rulesetId });
  const entries = Object.entries(properties);
  if (entries.length > 0) {
    await Properties.createMany(
      db,
      entries.map(([type, value]) => ({ entityId: item.id, entityType: "items", type, value })),
    );
  }
  invalidateSeededRuleset(rulesetId);
  return item;
}
