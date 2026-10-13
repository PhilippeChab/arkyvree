import { Box, Stack, Typography } from "@mui/material";

import { StatusChip } from "@/client/src/components/common/index.ts";
import { formatTrimmed, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { capitalize } from "@/shared/text.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface EncumbranceProps {
  /** The sheet's carried weight and load thresholds (its combat's `encumbrance`). */
  encumbrance: CharacterDetail["combat"]["encumbrance"];
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

/** The load a 3.5 character carries, under its equipment: its carried weight, its loads' limits, and a load past light. */
export function Encumbrance({ encumbrance }: EncumbranceProps) {
  const boxes = [
    { label: "Carried", weight: encumbrance.carriedweight },
    { label: "Light", weight: encumbrance.lightload },
    { label: "Medium", weight: encumbrance.mediumload },
    { label: "Heavy", weight: encumbrance.heavyload },
  ];
  // A load past light says so: medium, heavy or overloaded
  const loadChip = encumbrance.load && encumbrance.load !== "light" && (
    <StatusChip
      label={capitalize(encumbrance.load)}
      color={encumbrance.load === "overloaded" ? "error" : encumbrance.load === "heavy" ? "warning" : "info"}
    />
  );
  return (
    <>
      <Stack spacing={1} sx={{ display: { sm: "none" } }}>
        <Box sx={PHONE_BOXES_SX}>
          {boxes.map(({ label, weight }) => (
            <ScoreBox
              key={label}
              label={label}
              compact
              value={
                <>
                  {formatTrimmed(weight ?? 0)}
                  <Box component="span" sx={UNIT_SX}>
                    lbs
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
          <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
            Carried Weight: {formatWeight(encumbrance.carriedweight ?? 0)}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Light: {formatWeight(encumbrance.lightload ?? 0)}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Medium: {formatWeight(encumbrance.mediumload ?? 0)}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Heavy: {formatWeight(encumbrance.heavyload ?? 0)}
          </Typography>
          {loadChip}
        </Stack>
      </Box>
    </>
  );
}
