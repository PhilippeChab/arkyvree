import { Alert, Box, Stack, Typography } from "@mui/material";
import { type ReactNode } from "react";

import { PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

interface AuthPageProps {
  children: ReactNode;
  /** The last request's failure, shown above the form. */
  error?: string | null;
  /** A confirmation shown above the form ("A new code has been sent"). */
  notice?: string | null;
  subtitle?: ReactNode;
  title: string;
}

/** The frame each auth page puts its content in: its title, subtitle, error and notice. */
export function AuthPage({ children, title, subtitle, error, notice }: AuthPageProps) {
  const isMobile = useIsMobile();
  const page = (
    <Stack>
      <Typography sx={{ typography: { xs: "h5", sm: "h4" }, textAlign: "center" }} component="h1" gutterBottom>
        {title}
      </Typography>

      <Stack spacing={3}>
        {subtitle && (
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            {subtitle}
          </Typography>
        )}

        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}
          <Box>{children}</Box>
        </Stack>
      </Stack>
    </Stack>
  );

  return (
    <PageTransition sx={{ width: "100%", maxWidth: 450 }}>
      {/* On a phone the layout's panel frames the page, under the brand: no panel in a panel */}
      {isMobile ? <Box sx={{ p: { xs: 2, sm: 4 } }}>{page}</Box> : <Panel>{page}</Panel>}
    </PageTransition>
  );
}
