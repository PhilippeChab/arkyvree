import type { ListDescription } from "@/engine/core/module/index.ts";
import { ITEM_COST_GP, ITEM_IS_TEMPLATE, ITEM_TYPE, ITEM_WEIGHT } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 item's list: its name, type, template, cost and weight, its description. */
export const ITEM_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    { field: ITEM_TYPE, label: "Type", reads: "muted", share: 10, slot: "inline" },
    { field: ITEM_IS_TEMPLATE, label: "Template", reads: "template", share: 8 },
    { field: ITEM_COST_GP, label: "Cost", reads: "decimal", share: 10, slot: "inline", unit: "gp" },
    { field: ITEM_WEIGHT, label: "Weight", reads: "decimal", share: 10, slot: "inline", unit: "lbs" },
  ],
};
