import { Stack, Tooltip } from "@mui/material";

import { HelpIcon } from "@/client/src/components/icons/index.ts";

import { faqTooltip } from "./faqTooltip.tsx";

interface HelpLabelProps {
  help: string;
  label: string;
}

/**
 * A label with its help, wherever help is given (a tab's, a field's, a dialog's title): the question-mark icon, at
 * 16px, whose tooltip explains it and points to the help center.
 */
export function HelpLabel({ label, help }: HelpLabelProps) {
  return (
    <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      {label}
      <Tooltip title={faqTooltip(help)}>
        <HelpIcon sx={{ fontSize: 16, color: "text.secondary", cursor: "help" }} />
      </Tooltip>
    </Stack>
  );
}
