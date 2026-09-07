import { Box, Button, Typography } from "@mui/material";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Sentry } from "@/client/src/lib/sentry.ts";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static isChunkLoadError(error: unknown): boolean {
    // Vite fires this custom error type for failed dynamic imports
    if (error instanceof TypeError && error.message.includes("import")) return true;
    // Webpack uses a named error
    if (error instanceof Error && error.name === "ChunkLoadError") return true;
    // Some browsers wrap it as a generic error with a failed network request cause
    if (error instanceof Error && error.cause instanceof TypeError) return true;
    return false;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, isChunkError: ErrorBoundary.isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.state.isChunkError) {
      const lastReload = sessionStorage.getItem("chunk_reload");
      if (!lastReload || Date.now() - Number(lastReload) > 10_000) {
        sessionStorage.setItem("chunk_reload", String(Date.now()));
        window.location.reload();
      }
      return;
    }
    // eslint-disable-next-line no-console -- ErrorBoundary must log unrecoverable errors
    console.error("Uncaught error:", error, info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.isChunkError) {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            bgcolor: "#2a251e",
            color: "#e0d4b8",
          }}
        >
          <Typography variant="body1">Updating — please refresh if this persists.</Typography>
        </Box>
      );
    }

    if (this.state.hasError) {
      return (
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
            bgcolor: "#2a251e",
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
            sx={{
              fontFamily: '"Lora Variable", Georgia, serif',
              color: "#d2b48c",
              fontWeight: 600,
            }}
          >
            A Critical Failure
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: "#e0d4b8",
              maxWidth: 420,
              lineHeight: 1.7,
            }}
          >
            You rolled a natural 1.<br />
            Something broke unexpectedly.
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              sx={{
                color: "#d2b48c",
                borderColor: "#d2b48c",
                "&:hover": { borderColor: "#deb887", bgcolor: "rgba(210, 180, 140, 0.08)" },
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
                bgcolor: "#d2b48c",
                color: "#2a251e",
                fontWeight: 600,
                "&:hover": { bgcolor: "#deb887" },
              }}
            >
              Return to Camp
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
