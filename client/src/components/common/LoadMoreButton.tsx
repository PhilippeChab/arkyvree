import { Button, Stack } from "@mui/material";

import { DiceSpinner } from "./DiceSpinner.tsx";

interface LoadMoreButtonProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onClick: () => void;
  /** `large` for a page's main list, `medium` for lists inside a section or dialog. */
  size?: "medium" | "large";
}

/** Fetches the next page of an infinite query, "Load More" wherever it shows; renders nothing on the last page. */
export function LoadMoreButton({ hasNextPage, isFetchingNextPage, onClick, size = "medium" }: LoadMoreButtonProps) {
  if (!hasNextPage) return null;

  return (
    <Stack direction="row" sx={{ justifyContent: "center" }}>
      <Button
        variant="outlined"
        size={size}
        onClick={onClick}
        disabled={isFetchingNextPage}
        sx={[
          size === "large" && {
            px: 4,
            py: 1.5,
            borderRadius: 2,
            fontWeight: 600,
            borderWidth: 2,
            "&:hover": { borderWidth: 2 },
          },
        ]}
      >
        <DiceSpinner size="small" loading={isFetchingNextPage}>
          Load More
        </DiceSpinner>
      </Button>
    </Stack>
  );
}
