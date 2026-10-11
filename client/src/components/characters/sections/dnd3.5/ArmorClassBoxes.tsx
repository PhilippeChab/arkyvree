import { Box } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface ArmorClassBoxesProps {
  /** A weapon set's armor class, as the rules answer it: its AC, touch AC and flat-footed AC. */
  ac: CharacterDetail["combat"]["weaponSets"][number]["ac"];
}

/** A weapon set's armor class in three compact boxes: its AC, its touch AC and its flat-footed AC. */
export function ArmorClassBoxes({ ac }: ArmorClassBoxesProps) {
  const boxes = [
    { label: "AC", value: ac.total },
    { label: "Touch", value: ac.touch },
    { label: "Flat-footed", value: ac.flatfooted },
  ];

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 112px))", gap: 1 }}>
      {boxes.map(({ label, value }) => (
        <ScoreBox key={label} label={label} value={value} compact />
      ))}
    </Box>
  );
}
