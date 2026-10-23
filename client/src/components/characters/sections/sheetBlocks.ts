import type { CharacterDetail } from "@/client/src/lib/queries.ts";

/** A sheet's block of a kind. */
export type BlockOf<K extends SheetBlock["kind"]> = Extract<SheetBlock, { kind: K }>;

/** A block of a character's sheet, as the engine describes it, in its module's order. */
export type SheetBlock = CharacterDetail["blocks"][number];

/** A score in a `scores` block. */
export type SheetScore = BlockOf<"scores">["scores"][number];

/** A table a block holds: a `stats` block's panel's. */
export type SheetTable = BlockOf<"stats">["panels"][number]["table"];

/** The sheet's block of a kind under its key, if it has one. */
export function blockOf<K extends SheetBlock["kind"]>(blocks: readonly SheetBlock[], kind: K, key: string) {
  return blocks.find((block): block is BlockOf<K> => block.kind === kind && block.key === key);
}
