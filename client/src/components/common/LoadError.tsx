import { Alert, Button, type SxProps, type Theme } from "@mui/material";

import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";

interface LoadErrorProps {
  /** What failed to load, as the message names it ("Characters", "Feats"). */
  what: string;
  error: unknown;
  /** Loads it again: a Retry button. */
  onRetry?: () => void;
  sx?: SxProps<Theme>;
}

/** A list, a section or a step that couldn't load what it shows, said as `loadFailureMessage` says it. */
export function LoadError({ what, error, onRetry, sx }: LoadErrorProps) {
  return (
    <Alert
      severity="error"
      sx={sx}
      action={
        onRetry && (
          <Button color="inherit" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    >
      {loadFailureMessage(what, error)}
    </Alert>
  );
}
