import type { InferRequestType } from "hono/client";

import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

/** An item's request's body, which `toItemPayload` makes of its form. */
type ItemBody = InferRequestType<(typeof rpc.api.rulesets)[":id"]["items"]["$post"]>["json"];

/** An item's form: its body, its cost and its weight as their fields hold them, text (`toItemPayload` reads them). */
export type ItemFormData = Omit<ItemBody, "weight" | "costGp"> & {
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
): ItemFormData {
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

export function toItemPayload(data: ItemFormData): ItemBody {
  const { sourceItemId, ...rest } = data;
  return {
    ...rest,
    weight: parseNumericField(data.weight),
    costGp: parseNumericField(data.costGp),
    ...(!data.isTemplate && sourceItemId ? { sourceItemId } : {}),
  };
}
