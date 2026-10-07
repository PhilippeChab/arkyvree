import { Box, Link as MuiLink, Typography } from "@mui/material";

import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

export function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        width: "100%",
        py: 2,
        px: { xs: 2, md: 3 },
        mt: 2,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        color: "text.secondary",
      }}
    >
      <Typography variant="caption">© {new Date().getFullYear()} Arkyvree</Typography>
      <MuiLink
        href={EXTERNAL_LINKS.source}
        target="_blank"
        rel="noopener noreferrer"
        variant="caption"
        color="inherit"
        underline="hover"
        sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, px: 1 }}
      >
        Source
      </MuiLink>
    </Box>
  );
}
