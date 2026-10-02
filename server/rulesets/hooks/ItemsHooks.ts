import type { ItemLocation } from "@/shared/enums.ts";

export interface ItemsHooks {
  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined;
}
