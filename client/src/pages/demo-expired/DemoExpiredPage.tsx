import { Button } from "@mui/material";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { AuthPage } from "@/client/src/components/auth/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

export default function DemoExpiredPage() {
  usePageTitle("Demo expired");

  const clearDemoExpired = useAuthStore((state) => state.clearDemoExpired);

  useEffect(() => clearDemoExpired(), [clearDemoExpired]);

  return (
    <AuthPage
      title="Your demo has ended"
      subtitle="Demo sessions last one hour and reset when they end. Sign up to keep working in a real account."
    >
      <Button variant="contained" color="primary" fullWidth component={Link} to={"/sign-up"}>
        Sign Up
      </Button>
    </AuthPage>
  );
}
