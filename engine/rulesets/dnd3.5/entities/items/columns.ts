import { Field, type FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd3.5/equipment.ts";
import { ITEM_COST_GP, ITEM_IS_TEMPLATE, ITEM_SLOT, ITEM_TYPE, ITEM_WEIGHT } from "@/vocabulary/dnd3.5/fields/index.ts";
import { ITEM_TYPES, TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { ITEM_FIELDS } from "./fields.ts";

/** A template's form shows it while its item is one: whether it's one isn't a column its form changes. */
const AS_TEMPLATE = { path: `fields.${ITEM_IS_TEMPLATE}`, values: [true] };

/** While its item is of a type a template can be of: a weapon, an armor or a shield. */
const OF_TEMPLATE_TYPE = { path: `fields.${ITEM_TYPE}`, values: TEMPLATE_ITEM_TYPES };

/**
 * A 3.5 item's columns, as its form shows them beside its name and description: its cost and its weight (each within
 * its field's bounds, and what it holds exactly: `Field.boundsOf`), its type (a template's one a template can be of),
 * and its slot, or, for a type a template can be of, its template (whose type sets its slot: `ItemPlacement.slotOfType`).
 */
export const ITEM_COLUMNS: FormField[] = [
  {
    field: ITEM_COST_GP,
    help: "What it costs",
    input: "decimal",
    label: "Cost",
    max: Field.boundsOf(ITEM_FIELDS.fields.cost).max,
    min: ITEM_FIELDS.fields.cost.min,
    unit: "gp",
  },
  {
    field: ITEM_WEIGHT,
    help: "What it weighs",
    input: "decimal",
    label: "Weight",
    max: Field.boundsOf(ITEM_FIELDS.fields.weight).max,
    min: ITEM_FIELDS.fields.weight.min,
    unit: "lbs",
  },
  {
    field: ITEM_TYPE,
    help: "What kind of item it is",
    input: "choice",
    label: "Item Type",
    multiple: false,
    options: ITEM_TYPES,
    shownWhen: [{ ...AS_TEMPLATE, except: true }],
  },
  {
    field: ITEM_TYPE,
    help: "What kind of item its copies are",
    input: "choice",
    label: "Item Type",
    multiple: false,
    options: TEMPLATE_ITEM_TYPES,
    required: true,
    shownWhen: [AS_TEMPLATE],
  },
  {
    field: ITEM_SLOT,
    help: "Where it's worn or held",
    input: "choice",
    label: "Slot",
    multiple: false,
    options: LOCATION_OPTIONS,
    shownWhen: [{ ...OF_TEMPLATE_TYPE, except: true }],
  },
  {
    help: "The template of its type it's made from, whose fields it starts from",
    input: "template",
    label: "Template",
    role: "madeFrom",
    shownWhen: [OF_TEMPLATE_TYPE, { ...AS_TEMPLATE, except: true }],
    typeField: ITEM_TYPE,
  },
];

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
