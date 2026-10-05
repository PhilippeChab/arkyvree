import type { InferRequestType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

type VariantsRequest = InferRequestType<(typeof rpc.api.rulesets)[":id"]["items"][":itemId"]["variants"]["$post"]>;

/** One variant to create, as the variants endpoint takes it. */
export type VariantRow = VariantsRequest["json"]["variants"][number];

export interface BulkVariantsFormValues {
  variants: VariantRow[];
}

/** The nth variant row of an item: its name numbered, its description copied. */
export function variantRow(item: { name: string; description?: string | null }, copyNumber: number): VariantRow {
  return {
    name: `${item.name} (Copy ${copyNumber})`,
    description: item.description ?? "",
  };
}
