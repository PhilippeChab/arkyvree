import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";

/** A save's columns, as its form shows them beside its name and description: the ability its bonus comes from. */
export const SAVE_COLUMNS: FormField[] = [
  {
    help: "The ability its bonus comes from",
    input: "ref",
    label: "Linked Ability",
    references: "abilities",
    required: true,
    role: "keyAbility",
  },
];

/** A save's list: its name, the ability its bonus comes from, its description. */
export const SAVE_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    {
      label: "Linked Ability",
      reads: "reference",
      references: "abilities",
      role: "keyAbility",
      share: 30,
    },
  ],
};
