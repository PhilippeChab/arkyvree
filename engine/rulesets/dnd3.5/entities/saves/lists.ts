import type { ListDescription } from "@/engine/core/module/index.ts";

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
