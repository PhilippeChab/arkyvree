import type { InferRequestType } from "hono/client";

import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type ItemFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["items"]["$post"]>["json"];

export type ItemFormInternal = Omit<ItemFormData, "weight" | "costGp"> & {
  costGp?: string;
  weight?: string;
};

/** The types an item's form offers. */
export const ITEM_TYPE_OPTIONS = [
  "Weapon",
  "Armor",
  "Shield",
  "Wondrous Item",
  "Ring",
  "Rod",
  "Staff",
  "Other",
] as const;

function parseNumericField(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
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
    type: item.type ?? "",
    slot: item.slot ?? "",
    isTemplate: item.isTemplate,
    sourceItemId: item.isTemplate ? "" : (item.sourceItemId ?? ""),
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
