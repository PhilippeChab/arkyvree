import { Box, Typography } from "@mui/material";

import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";

interface ValidationIssueListProps {
  issues: ApiValidationIssue[];
}

/** The issues of a save the server warned about: what failed, why, and the requirement tree. */
export function ValidationIssueList({ issues }: ValidationIssueListProps) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2, maxWidth: "100%", overflow: "hidden" }}>
      {issues.map((issue, i) => (
        <li key={i}>
          {issue.entityName && (
            <Typography component="span" variant="body2" sx={{ fontWeight: "bold" }}>
              {issue.entityName}
              {issue.entityType ? ` (${issue.entityType})` : ""}
              {": "}
            </Typography>
          )}
          <Typography component="span" variant="body2">
            {issue.message}
          </Typography>
          {issue.requirementTree && (
            <Typography
              component="pre"
              variant="caption"
              sx={{
                mt: 0.5,
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
          )}
        </li>
      ))}
    </Box>
  );
}
