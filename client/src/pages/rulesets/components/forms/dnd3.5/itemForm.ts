import type { InferRequestType } from "hono/client";

import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import type { Item } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";

/** An item's request's body, which `toItemPayload` makes of its form. */
type ItemBody = InferRequestType<(typeof rpc.api.rulesets)[":id"]["items"]["$post"]>["json"];

/**
 * An item's form: its body, its cost and its weight as their fields hold them, text, and its slot and template `""` for
 * none (`toItemPayload` reads them).
 */
export type ItemFormData = Omit<ItemBody, "costGp" | "slot" | "sourceItemId" | "weight"> & {
  costGp?: string;
  slot?: NonNullable<ItemBody["slot"]> | "";
  sourceItemId?: string;
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

/** A decimal field's number: null for none, which clears it. */
function parseNumericField(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The fields an item's form empties as its type changes to `type`: its template, which is a template of one type, and,
 * for a type a template can be of, its slot, which that type sets.
 */
export function fieldsClearedByType(type: unknown): ("slot" | "sourceItemId")[] {
  return isOneOf(type, TEMPLATE_ITEM_TYPES) ? ["slot", "sourceItemId"] : ["sourceItemId"];
}

/**
 * A template select's options, once its type's templates load (`templates`; none before, as a value with no option is
 * out of range): those templates, and the one the form holds (`held`) when it isn't one of them, a template of another
 * type, which the item's save refuses, so the select shows it and picking "None" clears it. Its name is the one the
 * item was saved with (`heldName`).
 */
export function templateOptions(
  templates: readonly { id: string; name: string }[] | undefined,
  held: string | undefined,
  heldName: string | null | undefined,
) {
  if (!templates) return [];
  const options = templates.map((template) => ({ value: template.id, label: template.name }));
  if (!held || options.some((option) => option.value === held)) return options;
  return [...options, { value: held, label: `${heldName ?? "Template"} (of another type)`, disabled: true }];
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

/** An item's request's body: what its form leaves empty is null, which clears it (a template has no template). */
export function toItemPayload(data: ItemFormData): ItemBody {
  return {
    ...data,
    weight: parseNumericField(data.weight),
    costGp: parseNumericField(data.costGp),
    slot: data.slot || null,
    sourceItemId: (!data.isTemplate && data.sourceItemId) || null,
  };
}
