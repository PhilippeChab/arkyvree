import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

/** A sheet's block of a kind. */
export type BlockOf<K extends SheetBlock["kind"]> = Extract<SheetBlock, { kind: K }>;

/** An entry of an `inventory` block. */
export type InventoryRow = BlockOf<"inventory">["rows"][number];

/** What an `inventory` block's table, dialogs, fields and toasts say. */
export type InventoryWords = BlockOf<"inventory">["words"];

/** A block of a character's sheet, as the engine describes it, in its module's order. */
export type SheetBlock = CharacterDetail["blocks"][number];

/** A column of a block's table. */
export type SheetColumn = SheetTable["columns"][number];

/** An entity an `entries` block lists. */
export type SheetEntry = BlockOf<"entries">["entries"][number];

/** A field of a `fields` block. */
export type SheetField = BlockOf<"fields">["lines"][number][number];

/** A row of a block's table. */
export type SheetRow = SheetTable["rows"][number];

/** A score in a `scores` block. */
export type SheetScore = BlockOf<"scores">["scores"][number];

/** A creature an entry bonds, as its details show it. */
export type SheetSubsheet = NonNullable<BlockOf<"entries">["entries"][number]["subsheet"]>;

/** A table a block holds: a `stats` block's panel's. */
export type SheetTable = NonNullable<BlockOf<"stats">["panels"][number]["table"]>;

/**
 * An entity's page in its ruleset, which a block's entry links to (`entityType`, its block's kind of entity): none
 * without a ruleset to read it in, an id, or a page of its kind.
 */
export function entityPagePath(rulesetId: string | undefined, entityType: string, id: string | null) {
  if (!rulesetId || !id || !isOneOf(entityType, CUSTOMIZATION_PAGE_TYPES)) return undefined;
  return `/rulesets/${rulesetId}/${buildCustomizationPath(entityType, id)}`;
}

/** The block a sheet opens with: its first `fields` block (3.5's identity), over its others, if it has one. */
export function openingBlock(blocks: readonly SheetBlock[]) {
  return blocks.find((block): block is BlockOf<"fields"> => block.kind === "fields");
}

/**
 * A table's columns, its name's first (its `primary` column's, else its first's), then the others in their order: as
 * its header and its rows lay them out, whatever order its block lists them in.
 */
export function splitNameColumn<C extends { slot: string }>(columns: readonly C[]) {
  const name = columns.find((column) => column.slot === "primary") ?? columns[0];
  return { name, others: columns.filter((column) => column !== name) };
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
