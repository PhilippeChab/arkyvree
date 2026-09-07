import type { location } from "@/drizzle/schema.ts";
import type { ItemsHooks } from "@/server/rulesets/hooks/ItemsHooks.ts";

export class Dnd35ItemsHooks implements ItemsHooks {
  resolveSlot(
    itemType: string | null | undefined,
    requestedSlot: (typeof location.enumValues)[number] | undefined,
  ): (typeof location.enumValues)[number] | undefined {
    if (itemType === "Armor") return "Torso";
    if (itemType === "Shield") return "Off Hand";
    return requestedSlot;
  }
}
