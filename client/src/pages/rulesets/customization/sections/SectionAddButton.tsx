import { Add as AddIcon } from "@mui/icons-material";
import { Box, Button } from "@mui/material";

/** A customization section's add button, right-aligned above its list. */
export function SectionAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onClick}>
        {label}
      </Button>
    </Box>
  );
}
