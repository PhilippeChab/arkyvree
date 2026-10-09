import { Box } from "@mui/material";

import { APP_NAME } from "@/client/src/lib/brand.ts";

/** Logo and wordmark shown in the app bar. */
export function AppBrand() {
  return (
    <>
      <Box
        component="img"
        src="/pwa-192x192.png"
        alt=""
        // 28px, then the gap to the wordmark
        sx={{ boxSizing: "content-box", width: 28, height: 28, pr: 1, verticalAlign: "middle" }}
      />
      {APP_NAME}
    </>
  );
}
