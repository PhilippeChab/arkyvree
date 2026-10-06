import { Typography } from "@mui/material";

import { DiceSpinner, LoadError, PageBody, PageHeader, Section } from "@/client/src/components/common/index.ts";
import { useOglLicense, usePageTitle } from "@/client/src/hooks/index.ts";

export default function LegalPage() {
  usePageTitle("Legal");
  const { data: text, error, refetch } = useOglLicense();

  return (
    <PageBody width="md">
      <PageHeader title="Legal" subtitle="Open Game License v1.0a, covering the SRD content used in Arkyvree." />

      {error ? (
        <LoadError what="License text" error={error} onRetry={() => void refetch()} />
      ) : (
        <Section>
          {text === undefined ? (
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
              }}
            >
              {text}
            </Typography>
          )}
        </Section>
      )}
    </PageBody>
  );
}
