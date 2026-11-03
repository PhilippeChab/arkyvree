import type { ListDeclaration } from "@/engine/core/module/index.ts";

/** A 3.5 spell's list: its name, its spell lists, its description. */
export const SPELL_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [{ reads: "pools", role: "listedIn", share: 15, slot: "inline" }],
};
