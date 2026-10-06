import { Button, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

interface PageErrorProps {
  message: string;
  /** The way out ("Back to Campaigns"), when the page has one. */
  backLabel?: string;
  /** Where the way out goes */
  backTo?: string;
}

/** A page that couldn't load what it shows: the reason, and a way back. */
export function PageError({ message, backLabel, backTo }: PageErrorProps) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 4 } }}>
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
        <Typography component="h1" role="alert" variant="h5" sx={{ color: "error.main" }}>
          {message}
        </Typography>
        {backTo && backLabel && (
          <Button variant="contained" component={Link} to={backTo}>
            {backLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
