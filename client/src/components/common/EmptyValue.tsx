import { Box } from "@mui/material";

/** What a value that isn't there says where only text goes: a read-only field's, which shows it muted. */
export const EMPTY_VALUE_TEXT = "—";

/** A description that isn't there, said one way by the cards and headers that show one: a note, no final period */
export const NO_DESCRIPTION = "No description provided";

/** A value that isn't there, in a cell, a field or a line: "—", muted. */
export function EmptyValue() {
  return (
    <Box component="span" sx={{ color: "text.secondary" }}>
      {EMPTY_VALUE_TEXT}
    </Box>
  );
}
