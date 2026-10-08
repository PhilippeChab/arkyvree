import { alpha, Button, Stack, ThemeProvider, Typography } from "@mui/material";
import * as Sentry from "@sentry/react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { isChunkLoadError, reloadForStaleChunks } from "@/client/src/lib/chunkReload.ts";
import { ERROR_THEME } from "@/client/src/theme/errorTheme.ts";

interface ErrorBoundaryProps {
  children: ReactNode;
}

/** Whether the app failed to render, and whether it failed loading a chunk a new version replaced. */
interface ErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
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
        <ThemeProvider theme={ERROR_THEME}>
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              bgcolor: "background.default",
              color: "text.secondary",
            }}
          >
            <Typography variant="body1">Updating — please refresh if this persists.</Typography>
          </Stack>
        </ThemeProvider>
      );
    }

    if (this.state.hasError) {
      return (
        <ThemeProvider theme={ERROR_THEME}>
          <Stack
            spacing={3}
            sx={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
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
              component="h1"
              sx={{ fontFamily: '"Lora Variable", Georgia, serif', color: "primary.main", fontWeight: 600 }}
            >
              A Critical Failure
            </Typography>
            <Stack spacing={4} sx={{ alignItems: "center" }}>
              <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 420, lineHeight: 1.7 }}>
                You rolled a natural 1.
                <br />
                Something broke unexpectedly.
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    this.setState({ hasError: false });
                    window.location.reload();
                  }}
                  sx={{
                    color: "primary.main",
                    borderColor: "primary.main",
                    "&:hover": {
                      borderColor: "primary.light",
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                    },
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
                  sx={{
                    bgcolor: "primary.main",
                    color: "background.default",
                    fontWeight: 600,
                    "&:hover": { bgcolor: "primary.light" },
                  }}
                >
                  Return to Camp
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </ThemeProvider>
      );
    }

    return this.props.children;
  }
}
