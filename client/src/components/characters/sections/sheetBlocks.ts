import type { CharacterDetail } from "@/client/src/lib/queries.ts";

/** A sheet's block of a kind. */
export type BlockOf<K extends SheetBlock["kind"]> = Extract<SheetBlock, { kind: K }>;

/** A block of a character's sheet, as the engine describes it, in its module's order. */
export type SheetBlock = CharacterDetail["blocks"][number];

/** A score in a `scores` block. */
export type SheetScore = BlockOf<"scores">["scores"][number];

/** A table a block holds: a `stats` block's panel's. */
export type SheetTable = NonNullable<BlockOf<"stats">["panels"][number]["table"]>;

/** The sheet's block of a kind under its key, if it has one. */
export function blockOf<K extends SheetBlock["kind"]>(blocks: readonly SheetBlock[], kind: K, key: string) {
  return blocks.find((block): block is BlockOf<K> => block.kind === kind && block.key === key);
}

/**
 * A sheet's blocks with a score's base set (`scoreKey`'s, in the `scores` block `blockKey`), as its edit shows it until
 * the server answers: its value moves by its base's change, whatever else adds to it, and its badge stays the one it
 * gave. Every other block and score is kept as it is, and so is a score with no base of its own.
 */
export function withBase<B extends SheetBlock>(blocks: readonly B[], blockKey: string, scoreKey: string, base: number) {
  const moved = (score: SheetScore) =>
    score.key === scoreKey && score.base
      ? { ...score, base: { ...score.base, value: base }, value: score.value + base - score.base.value }
      : score;
  return blocks.map((block) =>
    block.kind === "scores" && block.key === blockKey ? { ...block, scores: block.scores.map(moved) } : block,
  );
}
