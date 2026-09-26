import { Box, Button } from "@mui/material";

import { DiceSpinner } from "./DiceSpinner.tsx";

interface LoadMoreButtonProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onClick: () => void;
  label?: string;
  /** `large` for a page's main list, `medium` for lists inside a section or dialog. */
  size?: "medium" | "large";
}

/** Fetches the next page of an infinite query; renders nothing on the last page. */
export function LoadMoreButton({
  hasNextPage,
  isFetchingNextPage,
  onClick,
  label = "Load More",
  size = "medium",
}: LoadMoreButtonProps) {
  if (!hasNextPage) return null;

  return (
    <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
      <Button
        variant="outlined"
        size={size}
        onClick={onClick}
        disabled={isFetchingNextPage}
        sx={size === "large"
          ? { px: 4, py: 1.5, borderRadius: 2, fontWeight: 600, borderWidth: 2, "&:hover": { borderWidth: 2 } }
          : undefined}
      >
        <DiceSpinner size="small" loading={isFetchingNextPage}>{label}</DiceSpinner>
      </Button>
    </Box>
  );
}
