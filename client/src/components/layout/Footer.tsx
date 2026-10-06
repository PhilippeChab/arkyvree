import { Link as MuiLink, Stack, Typography } from "@mui/material";

import { externalLinks } from "@/client/src/lib/externalLinks.ts";

export function Footer() {
  return (
    <Stack
      component="footer"
      direction="row"
      spacing={2}
      sx={{
        width: "100%",
        py: 2,
        px: { xs: 2, md: 3 },
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
      }}
    >
      <Typography variant="caption">© {new Date().getFullYear()} Arkyvree</Typography>
      <MuiLink
        href={externalLinks.source}
        target="_blank"
        rel="noopener noreferrer"
        variant="caption"
        color="inherit"
        underline="hover"
        sx={{ py: 1.5, px: 1 }}
      >
        Source
      </MuiLink>
    </Stack>
  );
}
