import { Alert, Button } from "@mui/material";

import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";

interface LoadErrorProps {
  error: unknown;
  /** Loads it again: a Retry button. */
  onRetry?: () => void;
  /** What failed to load, as the message names it ("Characters", "Feats"). */
  what: string;
}

/** A list, a section or a step that couldn't load what it shows, said as `loadFailureMessage` says it. */
export function LoadError({ what, error, onRetry }: LoadErrorProps) {
  return (
    <Alert
      severity="error"
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
