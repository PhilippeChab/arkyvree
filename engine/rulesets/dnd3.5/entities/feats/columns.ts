import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { APTITUDES_REQUIRED } from "@/engine/rulesets/dnd3.5/entities/aptitudes/columns.ts";

/** A 3.5 feat's columns, as its form shows them beside its name and description: its feat pools (a new feat needs one). */
export const FEAT_COLUMNS: FormField[] = [
  {
    help: "The feat pools it's picked in",
    input: "links",
    key: "aptitudeIds",
    links: "featsAptitudesInRules",
    label: "Aptitudes",
    required: APTITUDES_REQUIRED,
  },
];

/** A 3.5 feat's list: its name, its feat pools, its description. */
export const FEAT_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ key: "featsAptitudesInRules", label: "Aptitudes", reads: "pools", share: 15, slot: "inline" }],
};
