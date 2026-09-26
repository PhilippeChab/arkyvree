import { Button } from "@mui/material";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { AuthPage } from "@/client/src/components/auth/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { DEMO_EXPIRED_FLAG } from "@/client/src/lib/demo.ts";

export default function DemoExpiredPage() {
  usePageTitle("Demo expired");
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.removeItem(DEMO_EXPIRED_FLAG); } catch { /* storage disabled */ }
  }, []);

  return (
    <AuthPage
      title="Your demo has ended"
      subtitle="Demo sessions last one hour and reset when they end. Sign up to keep working in a real account."
    >
      <Button variant="contained" color="primary" fullWidth onClick={() => navigate("/sign-up")}>
        Sign up
      </Button>
    </AuthPage>
  );
}
