import { Button, Stack } from "@mui/material";

import { AddIcon } from "@/client/src/components/icons/index.ts";

interface SectionAddButtonProps {
  label: string;
  onClick: () => void;
}

/** A customization section's add button, right-aligned above its list. */
export function SectionAddButton({ label, onClick }: SectionAddButtonProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onClick}>
        {label}
      </Button>
    </Stack>
  );
}
