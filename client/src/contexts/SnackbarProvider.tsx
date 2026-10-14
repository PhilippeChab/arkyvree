import { Alert, type AlertColor, Button, Snackbar } from "@mui/material";
import { type ReactNode, type SyntheticEvent, useCallback, useMemo, useState } from "react";

import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { pastInset, SAFE_BOTTOM } from "@/client/src/theme/safeArea.ts";

import { SnackbarContext, type ToastAction, type ToastOptions } from "./snackbarContext.ts";

interface SnackbarProviderProps {
  children: ReactNode;
}

interface ToastItem {
  action?: ToastAction;
  message: string;
  persistent?: boolean;
  severity: AlertColor;
}

export function SnackbarProvider({ children }: SnackbarProviderProps) {
  // The toast showing is the queue's head, until its exit transition ends; the next one opens then
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [closing, setClosing] = useState(false);
  const current = queue[0] ?? null;
  const open = current !== null && !closing;

  const enqueue = useCallback((message: string, severity: AlertColor, options?: ToastOptions) => {
    setQueue((prev) => [...prev, { message, severity, action: options?.action, persistent: options?.persistent }]);
  }, []);

  const success = useCallback((message: string) => enqueue(message, "success"), [enqueue]);
  const error = useCallback(
    (err: unknown, fallback: string) => enqueue(errorMessage(err, fallback), "error"),
    [enqueue],
  );
  const info = useCallback((message: string, options?: ToastOptions) => enqueue(message, "info", options), [enqueue]);
  const warning = useCallback((message: string) => enqueue(message, "warning"), [enqueue]);
  // The context's value, the same while its toasts come and go: its every reader would re-render with each one
  const snackbar = useMemo(() => ({ success, error, info, warning }), [success, error, info, warning]);

  const handleClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway") return;
    setClosing(true);
  };

  const handleExited = () => {
    setQueue((prev) => prev.slice(1));
    setClosing(false);
  };

  const action = current?.action;

  return (
    <SnackbarContext.Provider value={snackbar}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={current?.persistent ? null : action ? 6000 : 4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        // MUI sets a snackbar 24px up from `sm` on, in a media query a plain `bottom` loses to: the doubled class wins.
        // It stands over the screen's foot (`theme/safeArea.ts`)
        sx={{ "&&": { bottom: (theme) => pastInset(theme.spacing(1.5), SAFE_BOTTOM) } }}
        slotProps={{
          transition: { onExited: handleExited },
        }}
      >
        <Alert
          onClose={handleClose}
          severity={current?.severity ?? "info"}
          variant="filled"
          sx={{
            width: "100%",
            alignItems: "center",
            "& .MuiAlert-action": {
              pt: 0,
              alignItems: "center",
            },
          }}
          action={
            action ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  action.onClick();
                  setClosing(true);
                }}
              >
                {action.label}
              </Button>
            ) : undefined
          }
        >
          {current?.message ?? ""}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
