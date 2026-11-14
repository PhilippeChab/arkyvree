import { Container, Stack } from "@mui/material";
import { Navigate } from "react-router-dom";

import { PageHeader, PageTransition } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { AccountsPanel, SignUpPanel } from "./components/index.ts";

/** The instance's admin page: who may sign up, and its accounts. Anyone else goes to their dashboard. */
export default function AdminPage() {
  usePageTitle("Admin");
  const isAdmin = useAuthStore((s) => !!s.user?.isAdmin);
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <PageHeader title="Admin" subtitle={`Who can sign up to this ${APP_NAME}, and its accounts`} />
          <SignUpPanel />
          <AccountsPanel />
        </Stack>
      </Container>
    </PageTransition>
  );
}
