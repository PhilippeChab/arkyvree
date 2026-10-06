import { Box } from "@mui/material";

import { DiceSpinner } from "./DiceSpinner.tsx";

interface NextPageSpinnerProps {
  loading: boolean;
}

/** The foot of a list that loads its next page as it scrolls (`createListboxScrollHandler`), while that page loads. */
export function NextPageSpinner({ loading }: NextPageSpinnerProps) {
  if (!loading) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
      <DiceSpinner size="small" />
    </Box>
  );
}
