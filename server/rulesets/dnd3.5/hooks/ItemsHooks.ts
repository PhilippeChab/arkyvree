import type { ItemsHooks } from "@/server/rulesets/hooks/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";

export class Dnd35ItemsHooks implements ItemsHooks {
  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined {
    if (itemType === "Armor") return "Torso";
    if (itemType === "Shield") return "Off Hand";
    return requestedSlot;
  }
}
