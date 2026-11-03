import type { ListDeclaration } from "@/engine/core/module/index.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 class's list: its name, its hit die as its field labels it ("d10"), its description. */
export const CLASS_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [{ field: CLASS_HD, reads: "chip", share: 15 }],
};
