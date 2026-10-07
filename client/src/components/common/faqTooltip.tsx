import { Link as MuiLink, Stack, Typography } from "@mui/material";

import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

export function faqTooltip(text: string) {
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
