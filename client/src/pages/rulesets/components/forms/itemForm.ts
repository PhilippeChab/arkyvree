import type { InferRequestType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

/** An item's request's body, which `toEntityBody` makes of its form. */
export type ItemBody = InferRequestType<(typeof rpc.api.rulesets)[":id"]["items"]["$post"]>["json"];

/**
 * An item's form: its body, its cost and its weight as their fields hold them, text, and its slot and template `""` for
 * none (its columns' body, `toColumnsBody`, reads them).
 */
export type ItemFormData = Omit<ItemBody, "costGp" | "slot" | "sourceItemId" | "weight"> & {
  costGp?: string;
  slot?: NonNullable<ItemBody["slot"]> | "";
  sourceItemId?: string;
  weight?: string;
};
