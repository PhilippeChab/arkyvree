import type { ListDeclaration } from "@/engine/core/module/index.ts";

/** A 3.5 feat's list: its name, its feat pools, its description. */
export const FEAT_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [{ reads: "pools", role: "listedIn", share: 15, slot: "inline" }],
};
