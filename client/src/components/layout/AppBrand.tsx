import { Box, Stack } from "@mui/material";

import { APP_NAME } from "@/client/src/lib/brand.ts";

interface AppBrandProps {
  /**
   * An empty box as wide as the logo follows the name, so the name stands in the middle of the three: centered on the
   * window, it's right over the page's titles, where the logo alone before it would push it aside.
   */
  balanced?: boolean;
}

/** The logo's side. */
const LOGO_SIZE = 28;

/** Logo and wordmark shown in the app bar: a row of the logo, the name and, balanced, the logo's width again. */
export function AppBrand({ balanced = false }: AppBrandProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
      <Box component="img" src="/pwa-192x192.png" alt="" sx={{ width: LOGO_SIZE, height: LOGO_SIZE }} />
      <span>{APP_NAME}</span>
      {balanced && <Box sx={{ width: LOGO_SIZE }} />}
    </Stack>
  );
}
