import { Feedback } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";

export function FeedbackButton() {
  return (
    <Tooltip title="Feedback">
      <IconButton
        size="large"
        color="inherit"
        component="a"
        href={externalLinks.feedback}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Feedback />
      </IconButton>
    </Tooltip>
  );
}
