import { Alert, type AlertColor, Button, Snackbar } from '@mui/material';
import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  persistent?: boolean;
}

interface SnackbarContextType {
  success: (message: string, options?: ToastOptions) => void;
  /**
   * Show an error toast. Accepts a plain string, an Error (uses `.message`),
   * or anything else (falls back to `fallback`).
   */
  error: (err: unknown, fallback?: string) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

interface SnackbarProviderProps {
  children: ReactNode;
}

interface ToastItem {
  message: string;
  severity: AlertColor;
  action?: ToastAction;
  persistent?: boolean;
}

export function SnackbarProvider({ children }: SnackbarProviderProps) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue((prev) => prev.slice(1));
      setOpen(true);
    }
  }, [current, queue]);

  const enqueue = useCallback((message: string, severity: AlertColor, options?: ToastOptions) => {
    setQueue((prev) => [...prev, { message, severity, action: options?.action, persistent: options?.persistent }]);
  }, []);

  const success = useCallback((message: string, options?: ToastOptions) => enqueue(message, 'success', options), [enqueue]);
  const error = useCallback((err: unknown, fallback?: string) => {
    const message = typeof err === 'string'
      ? err
      : err instanceof Error
        ? (err.message || fallback || '')
        : (fallback || '');
    if (!message) return;
    enqueue(message, 'error');
  }, [enqueue]);
  const info = useCallback((message: string, options?: ToastOptions) => enqueue(message, 'info', options), [enqueue]);
  const warning = useCallback((message: string) => enqueue(message, 'warning'), [enqueue]);

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const handleExited = () => {
    setCurrent(null);
  };

  return (
    <SnackbarContext.Provider value={{ success, error, info, warning }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={current?.persistent ? null : current?.action ? 6000 : 4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: '12px !important' }}
        slotProps={{
          transition: { onExited: handleExited }
        }}
      >
        <Alert
          onClose={handleClose}
          severity={current?.severity ?? 'info'}
          variant="filled"
          sx={{
            width: '100%',
            alignItems: 'center',
            '& .MuiAlert-action': {
              pt: 0,
              alignItems: 'center',
            },
          }}
          action={current?.action ? (
            <Button color="inherit" size="small" onClick={() => { current.action!.onClick(); setOpen(false); }}>
              {current.action.label}
            </Button>
          ) : undefined}
        >
          {current?.message ?? ''}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (context === undefined) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}
