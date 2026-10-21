import { Box } from "@mui/material";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface ArmorClassBoxesProps {
  /** An armor class's boxes, as its rules label them: 3.5's AC, touch AC and flat-footed AC. */
  boxes: CharacterDetail["combat"]["weaponSets"][number]["armorClass"];
}

/** An armor class in compact boxes, side by side: 3.5's AC, its touch AC and its flat-footed AC. */
export function ArmorClassBoxes({ boxes }: ArmorClassBoxesProps) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 112px))`, gap: 1 }}>
      {boxes.map(({ label, value }) => (
        <ScoreBox key={label} label={label} value={value} compact />
      ))}
    </Box>
  );
}
