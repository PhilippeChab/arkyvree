import { Container, Stack } from "@mui/material";

import { OglLicenseText, PageHeader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";

export default function LegalPage() {
  usePageTitle("Legal");

  return (
    <PageTransition>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <PageHeader
            title="Legal"
            subtitle={`Open Game License v1.0a, covering the SRD content used in ${APP_NAME}.`}
          />

          <Panel>
            <OglLicenseText />
          </Panel>
        </Stack>
      </Container>
    </PageTransition>
  );
}
