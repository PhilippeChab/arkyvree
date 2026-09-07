import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { usePageTitle } from "@/client/src/hooks/index.ts";
import { DEMO_EXPIRED_FLAG } from "@/client/src/lib/demo.ts";

export default function DemoExpiredPage() {
  usePageTitle("Demo expired");
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.removeItem(DEMO_EXPIRED_FLAG); } catch { /* storage disabled */ }
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 6, sm: 10 } }}>
      <Stack spacing={3} sx={{ textAlign: "center", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Your demo has ended
        </Typography>
        <Typography sx={{ color: "text.secondary", maxWidth: 480 }}>
          Demo sessions last one hour and reset when they end. Sign up to keep
          working in a real account.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
          <Button variant="contained" color="primary" onClick={() => navigate("/sign-up")}>
            Sign up
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
