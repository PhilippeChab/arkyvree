import { useEffect, useState } from "react";
import { Box, Container, Paper, Typography } from "@mui/material";

import { DiceSpinner, PageTransition } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";

export default function LegalPage() {
  usePageTitle("Legal");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/legal/ogl-1.0a.md")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => { if (!cancelled) setText(t); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <PageTransition>
      <Container maxWidth="md" sx={{ py: { xs: 2, sm: 4 } }}>
        <Paper
          sx={{
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: "white",
            p: { xs: 2, sm: 4 },
            borderRadius: 4,
            mb: 4,
          }}
        >
          <Typography sx={{ typography: { xs: "h4", md: "h3" }, fontWeight: 800, mb: 1 }}>
            Legal
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            Open Game License v1.0a, covering the SRD content used in Arkyvree.
          </Typography>
        </Paper>

        <Paper sx={{ p: { xs: 2, sm: 4 } }}>
          {text === null && !error && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <DiceSpinner />
            </Box>
          )}
          {error && (
            <Typography variant="body2" color="error">
              Failed to load the license text. Please refresh.
            </Typography>
          )}
          {text !== null && (
            <Typography
              component="pre"
              variant="body2"
              sx={{
                color: "text.secondary",
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                margin: 0,
              }}
            >
              {text}
            </Typography>
          )}
        </Paper>
      </Container>
    </PageTransition>
  );
}
