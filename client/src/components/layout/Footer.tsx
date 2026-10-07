import { Link as MuiLink, Stack, Typography } from "@mui/material";

import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

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
      <Stack
        component={MuiLink}
        direction="row"
        href={EXTERNAL_LINKS.source}
        target="_blank"
        rel="noopener noreferrer"
        variant="caption"
        color="inherit"
        underline="hover"
        sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, px: 1 }}
      >
        Source
      </Stack>
    </Stack>
  );
}
