import { Box } from "@mui/material";

import { ScoreBox } from "./ScoreBox.tsx";

interface StatBoxesProps {
  /** The stats, each its label over its value: 3.5's AC, touch AC and flat-footed AC. */
  boxes: { label: string; value: string }[];
}

/** Stats in compact boxes, side by side, each as wide as the others: an armor class's: a weapon set's, a subsheet's. */
export function StatBoxes({ boxes }: StatBoxesProps) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 112px))`, gap: 1 }}>
      {boxes.map(({ label, value }) => (
        <ScoreBox key={label} label={label} value={value} compact />
      ))}
    </Box>
  );
}
