import type { FormField } from "@/engine/core/fields/index.ts";

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

/** A save's columns, as its form shows them beside its name and description: the ability its bonus comes from. */
export const SAVE_COLUMNS: FormField[] = [
  {
    help: "The ability its bonus comes from",
    input: "ref",
    key: "abilityId",
    label: "Linked Ability",
    references: "abilities",
    required: true,
  },
];
