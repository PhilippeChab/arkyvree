import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";

/** A language's columns, as its form shows them beside its name and description: its type, an empty one too. */
export const LANGUAGE_COLUMNS: FormField[] = [
  {
    help: "What kind of language it is",
    input: "text",
    key: "type",
    label: "Type",
    multiple: false,
    nullable: false,
    placeholder: "e.g., Spoken, Written, Sign, Secret",
  },
];

/** A language's list: its name, its type, its description. */
export const LANGUAGE_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ key: "type", label: "Type", reads: "text", share: 20, slot: "inline" }],
};
