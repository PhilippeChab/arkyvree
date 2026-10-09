import { Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";

import { HelpIcon } from "@/client/src/components/icons/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

import { CLICKABLE_SX } from "./clickable.ts";

interface HelpLabelProps {
  help: string;
  label: string;
}

/** The help icon, a stop in the keyboard's order: its tooltip opens as it takes focus, ringed as a clickable is. */
const HELP_ICON_SX = {
  borderRadius: "50%",
  "&:focus-visible": { ...CLICKABLE_SX["&:focus-visible"], outlineOffset: 1 },
};

/** A help's tooltip: its text, then where Help says more. */
function helpTooltip(text: string) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2">{text}</Typography>
      <Typography variant="body2">
        Read more in{" "}
        <MuiLink href={EXTERNAL_LINKS.help} target="_blank" rel="noopener noreferrer" variant="body2">
          Help
        </MuiLink>
      </Typography>
    </Stack>
  );
}

/**
 * A label with its help, wherever help is given (a tab's, a field's, a dialog's title): the question-mark icon, at
 * 16px, whose tooltip explains it and points to Help. The icon takes focus, so its tooltip opens from the keyboard too.
 */
export function HelpLabel({ label, help }: HelpLabelProps) {
  return (
    <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      {label}
      {/* The icon is named by its tooltip as it opens: the label it follows (a tab's, a dialog's title) keeps its name */}
      <Tooltip title={helpTooltip(help)}>
        <Stack component="span" tabIndex={0} sx={HELP_ICON_SX}>
          <HelpIcon sx={{ fontSize: 16, color: "text.secondary", cursor: "help" }} />
        </Stack>
      </Tooltip>
    </Stack>
  );
}
