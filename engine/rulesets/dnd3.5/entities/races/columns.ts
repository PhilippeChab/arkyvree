import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";
import { SIZE_OPTIONS } from "@/vocabulary/dnd3.5/sizes.ts";

/** A 3.5 race's columns, as its form shows them beside its name and description: its size and its base speed. */
export const RACE_COLUMNS: FormField[] = [
  {
    default: "Medium",
    field: RACE_SIZE,
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
    field: RACE_BASE_SPEED,
    help: "How far its members move a round",
    input: "number",
    key: "baseSpeed",
    label: "Base Speed",
    min: 1,
    unit: "feet",
  },
];

/** A 3.5 race's list: its name, its size and its speed ("30 ft"), its description. */
export const RACE_LIST: ListDescription = {
  nameShare: 15,
  columns: [
    { field: RACE_SIZE, key: "size", label: "Size", reads: "chip", share: 10 },
    { field: RACE_BASE_SPEED, key: "baseSpeed", label: "Speed", reads: "number", share: 10, unit: "ft" },
  ],
};
