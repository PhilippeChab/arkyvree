import { Box, Link as MuiLink, Typography } from "@mui/material";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";

export function faqTooltip(text: string) {
  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {text}
      </Typography>
      <Typography variant="body2">
        Learn more{" "}
        <MuiLink href={externalLinks.help} target="_blank" rel="noopener noreferrer" variant="body2">
          here
        </MuiLink>
        !
      </Typography>
    </Box>
  );
}
