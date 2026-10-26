import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A language's columns, as its form shows them beside its name and description: its type, which a form gives (empty
 * when it has none, which stores no row, as every write stores an empty text).
 */
export const LANGUAGE_COLUMNS: FormField[] = [
  {
    field: LANGUAGE_TYPE,
    help: "What kind of language it is",
    input: "text",
    label: "Type",
    multiple: false,
    nullable: false,
    placeholder: "e.g., Spoken, Written, Sign, Secret",
  },
];

/** A language's list: its name, its type, its description. */
export const LANGUAGE_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ field: LANGUAGE_TYPE, label: "Type", reads: "text", share: 20, slot: "inline" }],
};
