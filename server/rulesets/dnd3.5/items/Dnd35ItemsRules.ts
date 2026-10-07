import type { ItemsRules } from "@/server/rulesets/engine/module/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";

export class Dnd35ItemsRules implements ItemsRules {
  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined {
    if (itemType === "Armor") return "Torso";
    if (itemType === "Shield") return "Off Hand";
    return requestedSlot;
  }
}
