import { Container, Stack } from "@mui/material";

import { OglLicenseText, PageHeader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";

export default function LegalPage() {
  usePageTitle("Legal");

  return (
    <PageTransition>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <PageHeader title="Legal" subtitle="Open Game License v1.0a, covering the SRD content used in Arkyvree." />

          <Panel>
            <OglLicenseText />
          </Panel>
        </Stack>
      </Container>
    </PageTransition>
  );
}
