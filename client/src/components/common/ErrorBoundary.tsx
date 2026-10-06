import { Button, Stack, ThemeProvider, Typography } from "@mui/material";
import * as Sentry from "@sentry/react";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { DiceIcon } from "@/client/src/components/icons/index.ts";
import { isChunkLoadError, reloadForStaleChunks } from "@/client/src/lib/chunkReload.ts";
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
            <Typography>Updating — please refresh if this persists.</Typography>
          </Stack>
        </ThemeProvider>
      );
    }

    if (this.state.hasError) {
      return (
        <ThemeProvider theme={FALLBACK_THEME}>
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
            <DiceIcon fontSize="hero" sx={{ color: "primary.main" }} />
            <Typography component="h1" variant="h3" sx={{ fontFamily: '"Lora Variable", Georgia, serif' }}>
              A Critical Failure
            </Typography>
            <Typography sx={{ color: "text.secondary", maxWidth: 420 }}>
              You rolled a natural 1.
              <br />
              Something broke unexpectedly.
            </Typography>
            <Stack direction="row" spacing={1}>
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
            </Stack>
          </Stack>
        </ThemeProvider>
      );
    }

    return this.props.children;
  }
}
