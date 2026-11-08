import type { ListDeclaration } from "@/engine/core/module/index.ts";
import { SPECIES_SIZE, SPECIES_SPEED } from "@/vocabulary/dnd5/fields/index.ts";

/** A species' list: its name, its size and its speed ("30 feet"), its description. */
export const SPECIES_LIST: ListDeclaration = {
  nameShare: 15,
  columns: [
    { field: SPECIES_SIZE, reads: "chip", share: 10 },
    { field: SPECIES_SPEED, label: "Speed", reads: "number", share: 10 },
  ],
};
