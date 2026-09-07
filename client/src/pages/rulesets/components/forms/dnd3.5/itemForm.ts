import type { rpc } from "@/client/src/services/rpc.ts";
import type { InferRequestType } from "hono/client";

export type ItemFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["items"]["$post"]
>["json"];

export type ItemFormInternal = Omit<ItemFormData, "weight" | "costGp"> & {
  weight?: string;
  costGp?: string;
};

function parseNumericField(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function toItemPayload(data: ItemFormInternal): ItemFormData {
  const { sourceItemId, ...rest } = data;
  return {
    ...rest,
    weight: parseNumericField(data.weight),
    costGp: parseNumericField(data.costGp),
    ...(sourceItemId ? { sourceItemId } : {}),
  };
}

export const DECIMAL_PATTERN = { value: /^(\d+\.?\d*|\.\d+)?$/, message: "Must be a number" };
