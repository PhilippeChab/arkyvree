import HelpOutline from "@mui/icons-material/HelpOutlined";
import { Tooltip } from "@mui/material";

import { faqTooltip } from "./faqTooltip.tsx";

interface FaqHelpIconProps {
  text: string;
  size?: number;
}

export function FaqHelpIcon({ text, size = 16 }: FaqHelpIconProps) {
  return (
    <Tooltip title={faqTooltip(text)} arrow>
      <HelpOutline sx={{ fontSize: size, color: "text.secondary", cursor: "help" }} />
    </Tooltip>
  );
}
