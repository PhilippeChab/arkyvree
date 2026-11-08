import type { ListDeclaration } from "@/engine/core/module/index.ts";

/** A save's list: its name, the ability its bonus comes from, its description. */
export const SAVE_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [{ reads: "reference", role: "keyAbility", share: 30 }],
};
