import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";
import { ITEM_TYPES, TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";

/** A template's form shows it while its item is one: whether it's one isn't a column its form changes. */
const AS_TEMPLATE = { path: "isTemplate", values: [true] };

/** While its item is of a type a template can be of: a weapon, an armor or a shield. */
const OF_TEMPLATE_TYPE = { path: "type", values: TEMPLATE_ITEM_TYPES };

/**
 * A 3.5 item's columns, as its form shows them beside its name and description: its cost and its weight, its type (a
 * template's one a template can be of), and its slot, or, for a type a template can be of, its template (whose type
 * sets its slot: `ItemPlacement.slotOfType`).
 */
export const ITEM_COLUMNS: FormField[] = [
  { help: "What it costs", input: "decimal", key: "costGp", label: "Cost", max: 99_999_999.99, min: 0, unit: "gp" },
  { help: "What it weighs", input: "decimal", key: "weight", label: "Weight", max: 9_999.99, min: 0, unit: "lbs" },
  {
    help: "What kind of item it is",
    input: "choice",
    key: "type",
    label: "Item Type",
    multiple: false,
    options: ITEM_TYPES,
    shownWhen: [{ ...AS_TEMPLATE, except: true }],
  },
  {
    help: "What kind of item its copies are",
    input: "choice",
    key: "type",
    label: "Item Type",
    multiple: false,
    options: TEMPLATE_ITEM_TYPES,
    required: true,
    shownWhen: [AS_TEMPLATE],
  },
  {
    help: "Where it's worn or held",
    input: "choice",
    key: "slot",
    label: "Slot",
    multiple: false,
    options: LOCATION_OPTIONS,
    shownWhen: [{ ...OF_TEMPLATE_TYPE, except: true }],
  },
  {
    help: "The template of its type it's made from, whose fields it starts from",
    input: "template",
    key: "sourceItemId",
    label: "Template",
    shownWhen: [OF_TEMPLATE_TYPE, { ...AS_TEMPLATE, except: true }],
    typeKey: "type",
  },
];

/** A 3.5 item's list: its name, type, template, cost and weight, its description. */
export const ITEM_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    { key: "type", label: "Type", reads: "muted", share: 10, slot: "inline" },
    { key: "template", label: "Template", reads: "template", share: 8 },
    { key: "costGp", label: "Cost", reads: "decimal", share: 10, slot: "inline", unit: "gp" },
    { key: "weight", label: "Weight", reads: "decimal", share: 10, slot: "inline", unit: "lbs" },
  ],
};
