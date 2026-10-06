import { AlertTitle, Button } from "@mui/material";

import type { ApiValidationIssue } from "@/client/src/services/rpc.ts";

import { AnimatedAlert } from "./AnimatedAlert.tsx";
import { DiceSpinner } from "./DiceSpinner.tsx";
import { ValidationIssueList } from "./ValidationIssueList.tsx";

interface ValidationWarningsProps {
  /** What the server warned about: "Equipment warnings" */
  title: string;
  issues: ApiValidationIssue[];
  onClose: () => void;
  /** Saves anyway, when the warnings let it */
  onForce?: () => void;
  /** While the save it forces runs */
  forcing?: boolean;
}

/** A save the server warned about: its issues, a way to dismiss them, and one to save anyway. */
export function ValidationWarnings({ title, issues, onClose, onForce, forcing = false }: ValidationWarningsProps) {
  return (
    <AnimatedAlert
      in={issues.length > 0}
      severity="warning"
      onClose={onClose}
      action={
        onForce && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={onForce}
            disabled={forcing}
            sx={{ whiteSpace: "nowrap" }}
          >
            <DiceSpinner size="small" loading={forcing}>
              Proceed Anyway
            </DiceSpinner>
          </Button>
        )
      }
      sx={{ "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 } }}
    >
      <AlertTitle>{title}</AlertTitle>
      <ValidationIssueList issues={issues} />
    </AnimatedAlert>
  );
}
