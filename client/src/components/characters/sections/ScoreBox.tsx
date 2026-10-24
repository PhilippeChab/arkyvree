import { Box, Paper, Stack, type SxProps, type Theme, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface ScoreBoxProps {
  /** What sits under the value: an ability's modifier. */
  badge?: ReactNode;
  /** The lines under the value that make it up ("Base: +2"): the full form's. */
  breakdown?: string[];
  /** The compact form: a caption over a smaller value (a subsheet's abilities, a weapon set's armor class). */
  compact?: boolean;
  /** What's changed above the breakdown's lines: an ability's base, raised and lowered on its owner's sheet. */
  editor?: ReactNode;
  label: string;
  /** The full form's least height, which lines up a row of boxes. */
  minHeight?: number;
  /** Its place in a row: a row of score boxes gives each its width (`SCORE_SLOT_SX`). */
  sx?: SxProps<Theme>;
  value: ReactNode;
}

/**
 * A score in its box, as the sheet shows ability scores, saving throws and armor classes: its label over its value, and
 * under it what goes with it. The full form gives each its breakdown; the compact one, a caption over a smaller value.
 */
export function ScoreBox({ badge, breakdown, compact = false, editor, label, minHeight, sx, value }: ScoreBoxProps) {
  return (
    <Stack
      component={Paper}
      variant="outlined"
      spacing={compact ? 0.5 : 0}
      sx={[
        { textAlign: "center" },
        compact
          ? { py: 1, px: 0.5, justifyContent: "center" }
          : { py: 2, px: 1.5, minHeight, justifyContent: "space-between" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography
        variant={compact ? "caption" : "h6"}
        component="p"
        sx={[
          { fontWeight: 600, textTransform: "uppercase" },
          // The compact form's label on one line: "Flat-footed" fits a phone's third of the row. The full form's wraps, a
          // word too long for its box broken inside it
          compact ? { lineHeight: 1, whiteSpace: "nowrap" } : { fontSize: "0.9rem", overflowWrap: "anywhere" },
        ]}
      >
        {label}
      </Typography>
      <Stack spacing={compact ? 0 : 2}>
        <Stack spacing={compact ? 0.5 : 1}>
          <Typography
            component="p"
            sx={{
              fontWeight: 700,
              lineHeight: 1,
              typography: compact ? { xs: "h6", sm: "h5" } : { xs: "h5", sm: "h4" },
            }}
          >
            {value}
          </Typography>
          {badge}
        </Stack>

        {(editor || breakdown) && (
          <Box sx={{ fontSize: "0.75rem", textAlign: "center" }}>
            {editor}
            {breakdown?.map((line) => (
              <Typography key={line} variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                {line}
              </Typography>
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
