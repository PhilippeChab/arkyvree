import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { ItemFields, ItemsEffects } from "@/server/rulesets/engine/module/index.ts";

import { ITEM_FIELD_PROPERTY_TYPES, toItemProperties } from "./itemFields.ts";

export class Dnd35ItemsEffects implements ItemsEffects {
  async syncProperties(tx: Db, itemId: string, fields: ItemFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [itemId], entityType: "items", types: ITEM_FIELD_PROPERTY_TYPES });

    const records = toItemProperties(itemId, fields);
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
