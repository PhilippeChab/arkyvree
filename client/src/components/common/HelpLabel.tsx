import { Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";

import { HelpIcon } from "@/client/src/components/icons/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

interface HelpLabelProps {
  help: string;
  label: string;
}

/** A help's tooltip: its text, then where the help center says more. */
function faqTooltip(text: string) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2">{text}</Typography>
      <Typography variant="body2">
        Learn more{" "}
        <MuiLink href={EXTERNAL_LINKS.help} target="_blank" rel="noopener noreferrer" variant="body2">
          here
        </MuiLink>
        !
      </Typography>
    </Stack>
  );
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
