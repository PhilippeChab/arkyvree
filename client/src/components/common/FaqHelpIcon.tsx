import { Tooltip } from "@mui/material";

import { HelpOutlineIcon } from "@/client/src/components/icons/index.ts";

import { faqTooltip } from "./faqTooltip.tsx";

interface FaqHelpIconProps {
  text: string;
  size?: number;
}

export function FaqHelpIcon({ text, size = 16 }: FaqHelpIconProps) {
  return (
    <Tooltip title={faqTooltip(text)} arrow>
      <HelpOutlineIcon sx={{ fontSize: size, color: "text.secondary", cursor: "help" }} />
    </Tooltip>
  );
}
