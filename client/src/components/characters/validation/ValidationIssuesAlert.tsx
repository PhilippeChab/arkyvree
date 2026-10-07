import { Button, Stack } from "@mui/material";

import { AnimatedAlert, SubsectionTitle } from "@/client/src/components/common/index.ts";
import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";

import { ValidationIssueList } from "./ValidationIssueList.tsx";

interface ValidationIssuesAlertProps {
  /**
   * The space under it, which opens and closes with it (`AnimatedAlert`'s), where its container doesn't space it; in a
   * spaced `Stack`, which spaces it even closed, it's mounted only while it shows.
   */
  gutter?: number;
  /** What the server's rules refused; none hides it. */
  issues: ApiValidationIssue[];
  onClose: () => void;
  /** Saves anyway (`force`); without it, the warnings only say why. */
  onProceed?: () => void;
  /** A save is running: Proceed Anyway waits. */
  pending?: boolean;
  /** Its heading: "Validation warnings", "Equipment warnings" */
  title: string;
}

/** The rules warnings a save came back with (`useValidationIssues`), at the form's top, and its Proceed Anyway. */
export function ValidationIssuesAlert({
  issues,
  title,
  onClose,
  onProceed,
  pending = false,
  gutter = 0,
}: ValidationIssuesAlertProps) {
  return (
    <AnimatedAlert
      in={issues.length > 0}
      severity="warning"
      onClose={onClose}
      action={
        onProceed && (
          <Button
            size="small"
            variant="contained"
            color="warning"
            onClick={onProceed}
            disabled={pending}
            sx={{ whiteSpace: "nowrap" }}
          >
            Proceed Anyway
          </Button>
        )
      }
      gutter={gutter}
      sx={{ "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 } }}
    >
      <Stack spacing={1}>
        <SubsectionTitle>{title}</SubsectionTitle>
        <ValidationIssueList issues={issues} />
      </Stack>
    </AnimatedAlert>
  );
}
