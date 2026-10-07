import type { ItemFields, ItemsRules } from "@/engine/rulesets/dnd3.5/module/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";

import { readItemFields } from "./itemFields.ts";

export class Dnd35ItemsRules implements ItemsRules {
  readProperties(properties: { type: string; value: string }[]): ItemFields {
    return readItemFields(properties);
  }

  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined {
    if (itemType === "Armor") return "Torso";
    if (itemType === "Shield") return "Off Hand";
    return requestedSlot;
  }
}
