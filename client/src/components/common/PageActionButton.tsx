import type { Theme } from "@mui/material";

import { AddButton } from "./AddButton.tsx";

interface PageActionButtonProps {
  label: string;
  onClick: () => void;
}

/** The look of a list page's create action: large, rounded, lifted off the header. */
const PAGE_ACTION_SX = {
  px: 3,
  py: 1.5,
  borderRadius: 2,
  boxShadow: (theme: Theme) => theme.boxShadows.action,
} as const;

/** The primary create action on a list page, in its header and in its empty state. */
export function PageActionButton({ label, onClick }: PageActionButtonProps) {
  return <AddButton size="large" label={label} onClick={onClick} sx={PAGE_ACTION_SX} />;
}
