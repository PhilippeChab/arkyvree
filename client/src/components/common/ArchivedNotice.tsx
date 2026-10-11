import { Alert, Typography } from "@mui/material";

interface ArchivedNoticeProps {
  /** Whether the session may unarchive it: its menu offers Unarchive, which the notice points to. */
  canUnarchive: boolean;
  /** What is archived, as its sentence names it: "ruleset", "campaign", "character". */
  what: string;
}

/** An archived record's page, above its tabs or its sheet: it's read-only, and who can unarchive it is told how. */
export function ArchivedNotice({ canUnarchive, what }: ArchivedNoticeProps) {
  return (
    <Alert severity="info">
      <Typography variant="body2">
        <strong>This {what} is archived and read-only.</strong> You can view all content but cannot make changes.
        {canUnarchive && " Unarchive it from its menu to edit it again."}
      </Typography>
    </Alert>
  );
}
