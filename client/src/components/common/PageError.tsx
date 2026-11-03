import { Button, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import { Panel } from "./Panel.tsx";

interface PageErrorProps {
  /** The way out, named for where it goes ("Back to Campaigns"), when the page has one. */
  backLabel?: string;
  /** Where it goes: a link */
  backTo?: string;
  message: string;
}

/** A page that couldn't load what it shows: the reason, and a way back. */
export function PageError({ message, backLabel, backTo }: PageErrorProps) {
  return (
    <Panel sx={{ textAlign: "center" }}>
      <Stack spacing={2} sx={{ alignItems: "center" }}>
        <Typography role="alert" variant="h5" component="p" gutterBottom sx={{ color: "error.main" }}>
          {message}
        </Typography>
        {backTo && backLabel && (
          <Button variant="contained" component={Link} to={backTo}>
            {backLabel}
          </Button>
        )}
      </Stack>
    </Panel>
  );
}
