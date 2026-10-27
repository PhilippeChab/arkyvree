import type { ListDescription } from "@/engine/core/module/index.ts";

/** A 3.5 feat's list: its name, its feat pools, its description. */
export const FEAT_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ label: "Aptitudes", reads: "pools", role: "listedIn", share: 15, slot: "inline" }],
};
