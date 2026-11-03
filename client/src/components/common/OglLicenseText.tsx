import { Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { DiceSpinner } from "./DiceSpinner.tsx";
import { LoadError } from "./LoadError.tsx";
import { oglLicenseQuery } from "./oglLicenseQueries.ts";

/**
 * The Open Game License's text, wherever it shows (the legal page, a system ruleset's notice): loaded as it first
 * shows, a spinner while it loads, its failure with a Retry.
 */
export function OglLicenseText() {
  const { data: text, error, refetch } = useQuery(oglLicenseQuery());

  if (text !== undefined) {
    return (
      <Typography
        component="pre"
        variant="body2"
        sx={{ color: "text.secondary", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", m: 0 }}
      >
        {text}
      </Typography>
    );
  }
  if (error) return <LoadError what="License text" error={error} onRetry={() => void refetch()} />;
  return <DiceSpinner sx={{ py: 4 }} />;
}
