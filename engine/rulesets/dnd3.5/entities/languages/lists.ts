import type { ListDeclaration } from "@/engine/core/module/index.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A language's list: its name, its type, its description. */
export const LANGUAGE_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [{ field: LANGUAGE_TYPE, reads: "text", share: 20, slot: "inline" }],
};
