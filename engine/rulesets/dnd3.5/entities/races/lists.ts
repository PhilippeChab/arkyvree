import type { ListDescription } from "@/engine/core/module/index.ts";
import { RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 race's list: its name, its size and its speed ("30 ft"), its description. */
export const RACE_LIST: ListDescription = {
  nameShare: 15,
  columns: [
    { field: RACE_SIZE, label: "Size", reads: "chip", share: 10 },
    { field: RACE_BASE_SPEED, label: "Speed", reads: "number", share: 10, unit: "ft" },
  ],
};
