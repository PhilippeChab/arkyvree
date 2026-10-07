import { Stack } from "@mui/material";

import { AddButton } from "@/client/src/components/common/index.ts";

interface SectionAddButtonProps {
  label: string;
  onClick: () => void;
}

/** A customization section's add button, right-aligned above its list. */
export function SectionAddButton({ label, onClick }: SectionAddButtonProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
      <AddButton label={label} onClick={onClick} />
    </Stack>
  );
}
