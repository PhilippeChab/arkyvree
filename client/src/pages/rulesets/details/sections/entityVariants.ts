import type { InferRequestType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

type VariantsRequest = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"][":entityId"]["variants"]["$post"]
>;

export interface EntityVariantsFormValues {
  variants: VariantRow[];
}

/** One variant to create, as the variants endpoint takes it. */
export type VariantRow = VariantsRequest["json"]["variants"][number];

/** The nth variant row of an entity: its name numbered, its description copied. */
export function variantRow(entity: { description?: string | null; name: string }, copyNumber: number): VariantRow {
  return {
    name: `${entity.name} (Copy ${copyNumber})`,
    description: entity.description ?? "",
  };
}
