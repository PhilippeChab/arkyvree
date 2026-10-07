import { Container, Stack, Typography } from "@mui/material";

import { DiceSpinner, LoadError, PageHeader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { useOglLicense, usePageTitle } from "@/client/src/hooks/index.ts";

export default function LegalPage() {
  usePageTitle("Legal");
  const { data: text, error, refetch } = useOglLicense();

  return (
    <PageTransition>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <PageHeader title="Legal" subtitle="Open Game License v1.0a, covering the SRD content used in Arkyvree." />

          <Panel>
            {error && text === undefined ? (
              <LoadError what="License text" error={error} onRetry={() => void refetch()} />
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
          </Panel>
        </Stack>
      </Container>
    </PageTransition>
  );
}
