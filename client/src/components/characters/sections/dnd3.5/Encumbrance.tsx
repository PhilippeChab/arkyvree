import { Stack, Typography } from "@mui/material";

import { StatusChip } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { capitalize } from "@/shared/text.ts";

interface EncumbranceProps {
  /** The sheet's carried weight and load thresholds (its combat's `encumbrance`). */
  encumbrance: CharacterDetail["combat"]["encumbrance"];
}

/** The load a 3.5 character carries, under its equipment: its carried weight, its loads' limits, and a load past light. */
export function Encumbrance({ encumbrance }: EncumbranceProps) {
  return (
    // Each figure wraps as a whole on narrow screens.
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
        Carried Weight: {encumbrance.carriedweight ?? 0} lbs
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Light: {encumbrance.lightload ?? 0}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Medium: {encumbrance.mediumload ?? 0}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Heavy: {encumbrance.heavyload ?? 0}
      </Typography>
      {encumbrance.load && encumbrance.load !== "light" && (
        <StatusChip
          label={capitalize(encumbrance.load)}
          color={encumbrance.load === "overloaded" ? "error" : encumbrance.load === "heavy" ? "warning" : "info"}
        />
      )}
    </Stack>
  );
}
