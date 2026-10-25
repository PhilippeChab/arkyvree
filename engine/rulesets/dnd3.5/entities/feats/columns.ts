import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { APTITUDES_REQUIRED } from "@/engine/rulesets/dnd3.5/entities/aptitudes/refusals.ts";

/** A 3.5 feat's columns, as its form shows them beside its name and description: its feat pools (a new feat needs one). */
export const FEAT_COLUMNS: FormField[] = [
  {
    help: "The feat pools it's picked in",
    input: "links",
    key: "aptitudeIds",
    label: "Aptitudes",
    references: "aptitudes",
    required: APTITUDES_REQUIRED,
    role: "listedIn",
  },
];

/** A 3.5 feat's list: its name, its feat pools, its description. */
export const FEAT_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ key: "links", label: "Aptitudes", reads: "pools", role: "listedIn", share: 15, slot: "inline" }],
};
