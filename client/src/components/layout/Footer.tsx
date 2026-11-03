import { Stack, Typography } from "@mui/material";

import { APP_NAME } from "@/client/src/lib/brand.ts";

import { SourceLink } from "./SourceLink.tsx";

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
      <Typography variant="caption">
        © {new Date().getFullYear()} {APP_NAME}
      </Typography>
      <SourceLink variant="caption" />
    </Stack>
  );
}
