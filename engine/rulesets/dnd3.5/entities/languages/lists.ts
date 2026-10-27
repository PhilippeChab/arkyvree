import type { ListDescription } from "@/engine/core/module/index.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A language's list: its name, its type, its description. */
export const LANGUAGE_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ field: LANGUAGE_TYPE, label: "Type", reads: "text", share: 20, slot: "inline" }],
};
