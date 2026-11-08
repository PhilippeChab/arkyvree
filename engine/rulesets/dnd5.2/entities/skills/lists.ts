import type { ListDeclaration } from "@/engine/core/module/index.ts";

/** A skill's list: its name, its ability, its description. */
export const SKILL_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [{ reads: "reference", role: "keyAbility", share: 15 }],
};
