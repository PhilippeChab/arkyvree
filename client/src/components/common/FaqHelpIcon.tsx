import { Tooltip } from "@mui/material";

import { HelpIcon } from "@/client/src/components/icons/index.ts";

import { faqTooltip } from "./faqTooltip.tsx";

interface FaqHelpIconProps {
  text: string;
}

export function FaqHelpIcon({ text }: FaqHelpIconProps) {
  return (
    <Tooltip title={faqTooltip(text)}>
      <HelpIcon fontSize="compact" sx={{ color: "text.secondary", cursor: "help" }} />
    </Tooltip>
  );
}
