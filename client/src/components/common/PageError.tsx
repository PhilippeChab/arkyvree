import { Button, Paper, Typography } from "@mui/material";

interface PageErrorProps {
  message: string;
  /** The way out ("Back to Campaigns"), when the page has one. */
  backLabel?: string;
  onBack?: () => void;
}

/** A page that couldn't load what it shows: the reason, and a way back. */
export function PageError({ message, backLabel, onBack }: PageErrorProps) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: "center" }}>
      <Typography role="alert" variant="h5" gutterBottom sx={{ color: "error.main" }}>
        {message}
      </Typography>
      {onBack && backLabel && (
        <Button variant="contained" onClick={onBack} sx={{ mt: 2 }}>
          {backLabel}
        </Button>
      )}
    </Paper>
  );
}
