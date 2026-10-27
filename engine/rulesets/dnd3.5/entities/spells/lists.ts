import type { ListDescription } from "@/engine/core/module/index.ts";

/** A 3.5 spell's list: its name, its spell lists, its description. */
export const SPELL_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ label: "Aptitudes", reads: "pools", role: "listedIn", share: 15, slot: "inline" }],
};
