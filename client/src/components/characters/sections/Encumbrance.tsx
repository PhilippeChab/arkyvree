import { Box, Stack, Typography } from "@mui/material";

import { StatusChip } from "@/client/src/components/common/index.ts";
import { formatTrimmed, formatWeight, poundsUnit } from "@/client/src/lib/formatNumeric.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface EncumbranceProps {
  /** The load the character carries, as its rules describe it: its figures, and its load past light (its combat's). */
  load: CharacterDetail["combat"]["load"];
}

/** On a phone, the figures in boxes, four to a row, as the sheet's armor classes */
const PHONE_BOXES_SX = {
  display: { xs: "grid", sm: "none" },
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 1,
};

/** A weight's unit, smaller than its number in a box */
const UNIT_SX = { fontSize: "0.6em", fontWeight: 500, pl: 0.25 };

/** From `sm` up, the figures in a line under the table, at its end */
const WIDE_LINE_SX = { display: { xs: "none", sm: "block" } };

/**
 * The load a character carries, under its equipment, as its rules give it: its figures (3.5's carried weight and its
 * loads' limits), in boxes on a phone and a line from `sm` up, and its load past light, as grave as it is.
 */
export function Encumbrance({ load }: EncumbranceProps) {
  const { figures, status } = load;
  const loadChip = status && <StatusChip label={status.label} color={status.tone} />;
  return (
    <>
      <Stack spacing={1} sx={{ display: { sm: "none" } }}>
        <Box sx={PHONE_BOXES_SX}>
          {figures.map(({ shortLabel, weight }) => (
            <ScoreBox
              key={shortLabel}
              label={shortLabel}
              compact
              value={
                <>
                  {formatTrimmed(weight ?? 0)}
                  <Box component="span" sx={UNIT_SX}>
                    {poundsUnit(formatTrimmed(weight ?? 0))}
                  </Box>
                </>
              }
            />
          ))}
        </Box>
        {loadChip && <Box>{loadChip}</Box>}
      </Stack>
      <Box sx={WIDE_LINE_SX}>
        {/* Each figure wraps as a whole on narrow screens */}
        <Stack
          direction="row"
          sx={{
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "center",
            columnGap: 2,
            rowGap: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {figures.map(({ label, weight }, index) => (
            // Its first figure, what it carries, leads
            <Typography
              key={label}
              variant="body2"
              sx={[{ color: "text.secondary" }, index === 0 && { fontWeight: 500 }]}
            >
              {`${label}: `}
              {formatWeight(weight ?? 0)}
            </Typography>
          ))}
          {loadChip}
        </Stack>
      </Box>
    </>
  );
}
