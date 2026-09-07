import { Feedback } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";

export function FeedbackButton() {
  return (
    <Tooltip title="Feedback">
      <IconButton
        size="large"
        color="inherit"
        component="a"
        href="https://arkyvree.featurebase.app/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Feedback />
      </IconButton>
    </Tooltip>
  );
}
