import { IconButton, Tooltip } from "@mui/material";

import { FeedbackIcon } from "@/client/src/components/icons/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

export function FeedbackButton() {
  return (
    <Tooltip title="Feedback">
      <IconButton
        aria-label="Feedback"
        size="large"
        color="inherit"
        component="a"
        href={EXTERNAL_LINKS.feedback}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FeedbackIcon />
      </IconButton>
    </Tooltip>
  );
}
