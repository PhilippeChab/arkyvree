import type { FormField } from "@/engine/core/fields/index.ts";

/** A 3.5 feat's columns, as its form shows them beside its name and description: its feat pools (a new feat needs one). */
export const FEAT_COLUMNS: FormField[] = [
  {
    help: "The feat pools it's picked in",
    input: "aptitudes",
    key: "aptitudeIds",
    label: "Aptitudes",
    required: true,
  },
];
