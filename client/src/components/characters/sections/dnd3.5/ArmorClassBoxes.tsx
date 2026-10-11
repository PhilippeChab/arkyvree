import { Box, Paper, Stack, Typography } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

interface ArmorClassBoxesProps {
  /** A weapon set's armor class, as the rules answer it: its AC, touch AC and flat-footed AC. */
  ac: CharacterDetail["combat"]["weaponSets"][number]["ac"];
}

/**
 * A weapon set's armor class in three boxes, as the ability scores are: its AC, emphasized, then its touch and
 * flat-footed AC.
 */
export function ArmorClassBoxes({ ac }: ArmorClassBoxesProps) {
  const boxes = [
    { label: "AC", value: ac.total, emphasized: true },
    { label: "Touch", value: ac.touch, emphasized: false },
    { label: "Flat-footed", value: ac.flatfooted, emphasized: false },
  ];

  return (
    // Each label on one line: "Flat-footed" fits a phone's third of the row
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 112px))", gap: 1 }}>
      {boxes.map(({ label, value, emphasized }) => (
        <Stack
          key={label}
          component={Paper}
          variant="outlined"
          spacing={0.5}
          sx={[
            { py: 1, px: 0.5, textAlign: "center", justifyContent: "center" },
            emphasized && { borderColor: "primary.main" },
          ]}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap" }}
          >
            {label}
          </Typography>
          <Typography
            sx={[
              { fontWeight: 700, lineHeight: 1, typography: { xs: "h6", sm: "h5" } },
              emphasized && { color: "primary.main", typography: { xs: "h5", sm: "h4" } },
            ]}
          >
            {value}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}
