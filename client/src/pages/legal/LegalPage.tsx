import { Container, Paper, Stack, Typography } from "@mui/material";

import { DiceSpinner, PageHeader, PageTransition } from "@/client/src/components/common/index.ts";
import { useOglLicense, usePageTitle } from "@/client/src/hooks/index.ts";

export default function LegalPage() {
  usePageTitle("Legal");
  const { data: text, isError } = useOglLicense();

  return (
    <PageTransition>
      <Container maxWidth="md" sx={{ py: { xs: 2, sm: 4 } }}>
        <Stack spacing={4}>
          <PageHeader title="Legal" subtitle="Open Game License v1.0a, covering the SRD content used in Arkyvree." />

          <Paper sx={{ p: { xs: 2, sm: 4 } }}>
            {isError ? (
              <Typography variant="body2" sx={{ color: "error.main" }}>
                Failed to load the license text. Please refresh.
              </Typography>
            ) : text === undefined ? (
              <DiceSpinner sx={{ py: 4 }} />
            ) : (
              <Typography
                component="pre"
                variant="body2"
                sx={{
                  color: "text.secondary",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontFamily: "inherit",
                  m: 0,
                }}
              >
                {text}
              </Typography>
            )}
          </Paper>
        </Stack>
      </Container>
    </PageTransition>
  );
}
