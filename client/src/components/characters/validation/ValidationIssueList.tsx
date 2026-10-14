import { Box, Typography } from "@mui/material";

import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";

interface ValidationIssueListProps {
  issues: ApiValidationIssue[];
}

/**
 * The issues the server's rules found, a save's warnings or a character's validation: each message as the engine
 * writes it, naming its entity in the ruleset's words ("Power Attack (Feat)"), and the requirement tree.
 */
export function ValidationIssueList({ issues }: ValidationIssueListProps) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2, maxWidth: "100%", overflow: "hidden" }}>
      {issues.map((issue, i) => (
        <li key={i}>
          <Typography component="span" variant="body2">
            {issue.message}
          </Typography>
          {issue.requirementTree && (
            <Box sx={{ pt: 0.5 }}>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  bgcolor: "action.hover",
                  p: 0.5,
                  borderRadius: 0.5,
                  maxWidth: "100%",
                  overflow: "auto",
                }}
              >
                {issue.requirementTree}
              </Typography>
            </Box>
          )}
        </li>
      ))}
    </Box>
  );
}
