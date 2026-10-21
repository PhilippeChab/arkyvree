/** How a value the tab changed before its save shows, wherever it does: its table's cells, its grid's, its strips'. */

/** A changed value's text. */
export const CHANGED_TEXT_SX = { fontWeight: 600, color: "secondary.dark" } as const;

/** A changed value's cell: its text, shaded. */
export const CHANGED_CELL_SX = { ...CHANGED_TEXT_SX, bgcolor: "action.selected", px: 0.5, borderRadius: 0.5 } as const;
