import { Box, Typography } from "@mui/material";

import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface ValidationIssueListProps {
  /** The character's, whose words name what an issue is about (a 3.5 power is a "Spell") */
  baseRules: BaseRules;
  issues: ApiValidationIssue[];
}

/**
 * The issues the server's rules found, a save's warnings or a character's validation: what failed, of what kind of
 * entity, why, and the requirement tree.
 */
export function ValidationIssueList({ issues, baseRules }: ValidationIssueListProps) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2, maxWidth: "100%", overflow: "hidden" }}>
      {issues.map((issue, i) => (
        <li key={i}>
          {issue.entityName && (
            <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
              {issue.entityName}
              {issue.entityType ? ` (${entityTypeLabel(issue.entityType, baseRules)})` : ""}
              {": "}
            </Typography>
          )}
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
