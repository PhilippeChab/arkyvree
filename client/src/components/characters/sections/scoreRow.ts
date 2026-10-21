/** A row of score boxes, as the sheet lays out its ability scores and its saving throws. */

/** The gap between a row's boxes, in the theme's spacing. */
export const SCORE_ROW_GAP = 2;

/** The row: its boxes wrap, a short last row centered under the others. */
export const SCORE_ROW_SX = { flexWrap: "wrap", justifyContent: "center" } as const;

/**
 * A box's place in its row (its `sx`): one width for every box, so a long label ("Constitution") never widens its box
 * past the others, two to a phone's row and seven to a laptop's. The row stretches its boxes to its tallest, so a label
 * that wraps keeps its row level.
 */
export const SCORE_SLOT_SX = { width: 140 };
