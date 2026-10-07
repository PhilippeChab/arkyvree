import type { ItemFields, ItemsEffects, PropertiesWrite } from "@/server/rulesets/engine/module/index.ts";

import { ITEM_FIELD_PROPERTY_TYPES, toItemProperties } from "./itemFields.ts";

export class Dnd35ItemsEffects implements ItemsEffects {
  properties(itemId: string, fields: ItemFields): PropertiesWrite {
    return {
      entityId: itemId,
      entityType: "items",
      types: ITEM_FIELD_PROPERTY_TYPES,
      rows: toItemProperties(itemId, fields),
    };
  }
}
