import type { FormField } from "@/engine/core/fields/index.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

/** A 3.5 race's columns, as its form shows them beside its name and description: its size and its base speed. */
export const RACE_COLUMNS: FormField[] = [
  {
    default: "Medium",
    help: "Its members' size",
    input: "choice",
    key: "size",
    label: "Size",
    multiple: false,
    options: SIZE_OPTIONS,
    required: true,
  },
  {
    default: 30,
    help: "How far its members move a round",
    input: "number",
    key: "baseSpeed",
    label: "Base Speed",
    min: 1,
    unit: "feet",
  },
];
