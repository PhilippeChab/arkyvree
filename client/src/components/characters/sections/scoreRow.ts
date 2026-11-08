/** A row of score boxes, as the sheet lays out its ability scores and its saving throws. */

/** The gap between a row's boxes, in the theme's spacing. */
export const SCORE_ROW_GAP = 2;

/** The row: its boxes wrap, a short last row centered under the others. */
export const SCORE_ROW_SX = { flexWrap: "wrap", justifyContent: "center" } as const;

/**
 * A box's place in its row (its `sx`): one width for every box, two to a phone's row and six to a laptop's, which
 * leaves "Constitution" room to spare. Its label stays on one line (`oneLine`): a font drawn wider than the app's
 * (Windows', a fallback serif) makes its box wider, never breaks its label. The row stretches its boxes to its tallest.
 */
export const SCORE_SLOT_SX = { width: { xs: 140, sm: 160 }, minWidth: "max-content" } as const;
