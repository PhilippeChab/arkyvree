import { Alert, type AlertColor, Button, Snackbar } from "@mui/material";
import { type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { TOAST_EXIT_WAIT } from "@/client/src/theme/animations.ts";
import { pastInset, SAFE_BOTTOM } from "@/client/src/theme/safeArea.ts";

import { SnackbarContext, type ToastAction, type ToastOptions } from "./snackbarContext.ts";

interface SnackbarProviderProps {
  children: ReactNode;
}

interface ToastItem {
  action?: ToastAction;
  /** Which toast it is, so only the one closing gives way to the next. */
  id: number;
  message: string;
  persistent?: boolean;
  severity: AlertColor;
}

export function SnackbarProvider({ children }: SnackbarProviderProps) {
  // The toast showing is the queue's head, until its exit transition ends (`closingId` names it meanwhile); the next one
  // opens then
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [closingId, setClosingId] = useState<number | null>(null);
  const lastId = useRef(0);
  const current = queue[0] ?? null;
  const open = current !== null && current.id !== closingId;

  const enqueue = useCallback((message: string, severity: AlertColor, options?: ToastOptions) => {
    lastId.current += 1;
    const id = lastId.current;
    setQueue((prev) => [...prev, { id, message, severity, action: options?.action, persistent: options?.persistent }]);
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

  // The toast `id` gives way to the next while it's the head closing, never after: its exit's late `onExited`, once the
  // wait below moved on, would drop the next toast unseen
  const dismiss = useCallback((id: number) => {
    setQueue((prev) => (prev[0]?.id === id ? prev.slice(1) : prev));
    setClosingId((prev) => (prev === id ? null : prev));
  }, []);

  const handleClose = (_event?: SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway" || !current) return;
    setClosingId(current.id);
  };

  const handleExited = () => {
    if (closingId !== null) dismiss(closingId);
  };

  // A closing toast whose transition never says its exit ended (it can skip `onExited`) would hold every toast after
  // it until the page reloads: a moment past its exit, the next one opens anyway
  useEffect(() => {
    if (closingId === null) return;
    const timer = setTimeout(() => dismiss(closingId), TOAST_EXIT_WAIT);
    return () => clearTimeout(timer);
  }, [closingId, dismiss]);

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
                  handleClose();
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
