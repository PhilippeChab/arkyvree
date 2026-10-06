import { Box } from "@mui/material";

import { FaqHelpIcon } from "./FaqHelpIcon.tsx";

/** A label with its help: the question-mark icon whose tooltip explains it (a section tab's, a field's). */
export function HelpLabel({ label, help }: { label: string; help: string }) {
  return (
    <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {label}
      <FaqHelpIcon text={help} />
    </Box>
  );
}
