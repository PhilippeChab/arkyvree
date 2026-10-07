import { Box } from "@mui/material";

/** A value that isn't there, in a cell, a field or a line: "—", muted. */
export function EmptyValue() {
  return (
    <Box component="span" sx={{ color: "text.secondary" }}>
      —
    </Box>
  );
}
