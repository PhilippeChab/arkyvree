import type { InferRequestType } from "hono/client";

import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type ItemFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["items"]["$post"]>["json"];

export type ItemFormInternal = Omit<ItemFormData, "weight" | "costGp"> & {
  weight?: string;
  costGp?: string;
};

/** The item types that can be based on a template. */
export type TemplateType = NonNullable<
  InferRequestType<(typeof rpc.api.rulesets)[":id"]["templates"]["$get"]>["query"]["type"]
>;

export const DECIMAL_PATTERN = { value: /^(\d+\.?\d*|\.\d+)?$/, message: "Must be a number" };

function parseNumericField(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function isTemplateType(type: string | null | undefined): type is TemplateType {
  return type === "Weapon" || type === "Armor" || type === "Shield";
}

/** The form values of an existing item: the editor's, or a duplicate's starting point. */
export function toItemForm(
  item: Pick<Item, "name" | "description" | "costGp" | "weight" | "type" | "slot" | "isTemplate" | "sourceItemId">,
): ItemFormInternal {
  return {
    name: item.name,
    description: item.description ?? "",
    costGp: formatDecimal(item.costGp) ?? "",
    weight: formatDecimal(item.weight) ?? "",
    type: item.type,
    slot: item.slot ?? undefined,
    isTemplate: item.isTemplate,
    sourceItemId: item.isTemplate ? undefined : (item.sourceItemId ?? undefined),
  };
}

export function toItemPayload(data: ItemFormInternal): ItemFormData {
  const { sourceItemId, ...rest } = data;
  return {
    ...rest,
    weight: parseNumericField(data.weight),
    costGp: parseNumericField(data.costGp),
    ...(!data.isTemplate && sourceItemId ? { sourceItemId } : {}),
  };
}
