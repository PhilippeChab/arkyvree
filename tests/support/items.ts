import { eq, type InferInsertModel } from "drizzle-orm";

import { inventoryInCharacter, type itemsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Items, Properties } from "@/server/repositories/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import { invalidateSeededRuleset } from "./rulesets.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/** An inventory entry a test gives a character: a seeded item by its name, or an item's id, equipped by default. */
export interface Carried {
  equipped?: boolean;
  item: string;
  location?: ItemLocation;
  quantity?: number;
  weaponSet?: number;
}

/** Replaces the character's inventory with these entries (`Carried`): seeded items by name, or item ids. */
export async function carry(character: Pick<Character, "id">, carried: Carried[]) {
  const { itemMap } = await getSeedCtx();
  await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
  if (carried.length === 0) return;
  await db.insert(inventoryInCharacter).values(
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
export async function createTestItem(
  values: Partial<InferInsertModel<typeof itemsInRules>> = {},
  properties: Record<string, string> = {},
) {
  const rulesetId = values.rulesetId ?? (await getSeedCtx()).rulesetId;
  const [item] = await Items.create(db, { name: `Test Item ${uniqueId()}`, ...values, rulesetId });
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
