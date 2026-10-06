import { Box, Button, ThemeProvider, Typography } from "@mui/material";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { isChunkLoadError, reloadForStaleChunks } from "@/client/src/lib/chunkReload.ts";
import { Sentry } from "@/client/src/lib/sentry.ts";
import { createAppTheme } from "@/client/src/theme/appTheme.ts";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

/** The fallback's theme: the app's provider sits inside this boundary, and may be what failed. */
const FALLBACK_THEME = createAppTheme(true);

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.state.isChunkError) {
      reloadForStaleChunks();
      return;
    }
    // React logs it (its default onCaughtError); Sentry gets its component stack too
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.isChunkError) {
      return (
        <ThemeProvider theme={FALLBACK_THEME}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              bgcolor: "background.default",
              color: "text.secondary",
            }}
          >
            <Typography variant="body1">Updating — please refresh if this persists.</Typography>
          </Box>
        </ThemeProvider>
      );
    }

    if (this.state.hasError) {
      return (
        <ThemeProvider theme={FALLBACK_THEME}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              gap: 3,
              p: 4,
              textAlign: "center",
              bgcolor: "background.default",
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: "4rem", sm: "6rem" },
                lineHeight: 1,
                filter: "grayscale(0.3)",
              }}
            >
              &#x1F480;
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontFamily: '"Lora Variable", Georgia, serif', color: "primary.main", fontWeight: 600 }}
            >
              A Critical Failure
            </Typography>
            <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 420, lineHeight: 1.7 }}>
              You rolled a natural 1.
              <br />
              Something broke unexpectedly.
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.reload();
                }}
              >
                Reload Page
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.href = "/";
                }}
              >
                Return to Camp
              </Button>
            </Box>
          </Box>
        </ThemeProvider>
      );
    }

    return this.props.children;
  }
}
