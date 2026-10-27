import type { ListDescription } from "@/engine/core/module/index.ts";
import { HIT_DIE_LABELS, HIT_DIE_VALUES } from "@/vocabulary/dnd3.5/classes.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 class's list: its name, its hit die as dice notation writes it ("d10"), its description. */
export const CLASS_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    {
      field: CLASS_HD,
      label: "Hit Die",
      labels: Object.fromEntries(HIT_DIE_VALUES.map((die, index) => [die, HIT_DIE_LABELS[index]])),
      reads: "chip",
      share: 15,
    },
  ],
};
