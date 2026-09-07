import type { location } from "@/drizzle/schema.ts";

export interface ItemsHooks {
  resolveSlot(
    itemType: string | null | undefined,
    requestedSlot: (typeof location.enumValues)[number] | undefined,
  ): (typeof location.enumValues)[number] | undefined;
}
