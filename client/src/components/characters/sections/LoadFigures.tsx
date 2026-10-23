import { Box, Stack, Typography } from "@mui/material";

import { StatusChip } from "@/client/src/components/common/index.ts";
import { type AmountUnit, formatAmount, formatTrimmed, unitAfter } from "@/client/src/lib/formatNumeric.ts";

import { ScoreBox } from "./ScoreBox.tsx";
import type { BlockOf } from "./sheetBlocks.ts";

interface LoadFiguresProps {
  /** The load the character carries, as its rules describe it: its figures, and its status past light. */
  load: NonNullable<BlockOf<"inventory">["load"]>;
  /** The unit its weights read in. */
  unit: AmountUnit;
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
 * The load a character carries, under its inventory, as its rules give it: its figures (3.5's carried weight and its
 * loads' limits), in boxes on a phone and a line from `sm` up, and its status past light, as grave as it is.
 */
export function LoadFigures({ load, unit }: LoadFiguresProps) {
  const { figures, status } = load;
  const loadChip = status && <StatusChip label={status.label} color={status.tone} />;
  return (
    <>
      <Stack spacing={1} sx={{ display: { sm: "none" } }}>
        <Box sx={PHONE_BOXES_SX}>
          {figures.map(({ short, weight }) => (
            <ScoreBox
              key={short}
              label={short}
              compact
              value={
                <>
                  {formatTrimmed(weight ?? 0)}
                  <Box component="span" sx={UNIT_SX}>
                    {unitAfter(formatTrimmed(weight ?? 0), unit)}
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
              {formatAmount(weight ?? 0, unit)}
            </Typography>
          ))}
          {loadChip}
        </Stack>
      </Box>
    </>
  );
}
