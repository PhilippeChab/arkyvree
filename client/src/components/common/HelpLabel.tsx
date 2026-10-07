import { Stack } from "@mui/material";

import { FaqHelpIcon } from "./FaqHelpIcon.tsx";

interface HelpLabelProps {
  label: string;
  help: string;
}

/** A label with its help: the question-mark icon whose tooltip explains it (a section tab's, a field's). */
export function HelpLabel({ label, help }: HelpLabelProps) {
  return (
    <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      {label}
      <FaqHelpIcon text={help} />
    </Stack>
  );
}
