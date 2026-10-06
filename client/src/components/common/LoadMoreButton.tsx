import { Button, Stack } from "@mui/material";

import { DiceSpinner } from "./DiceSpinner.tsx";

interface LoadMoreButtonProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onClick: () => void;
  label?: string;
  /** `large` for a page's main list, `medium` for lists inside a section or dialog, `small` for one nested in another. */
  size?: "small" | "medium" | "large";
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
    <Stack direction="row" sx={{ justifyContent: "center" }}>
      <Button variant="outlined" size={size} onClick={onClick} disabled={isFetchingNextPage}>
        <DiceSpinner size="small" loading={isFetchingNextPage}>
          {label}
        </DiceSpinner>
      </Button>
    </Stack>
  );
}
