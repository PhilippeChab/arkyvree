import { Button } from "@mui/material";
import type { ReactNode } from "react";

import { DiceSpinner } from "@/client/src/components/common/index.ts";

interface AuthSubmitButtonProps {
  children: ReactNode;
  disabled?: boolean;
  /** Its request is in flight: it spins, and waits. */
  pending: boolean;
}

/** An auth form's full-width submit button, spinning while the request runs. */
export function AuthSubmitButton({ pending, disabled = false, children }: AuthSubmitButtonProps) {
  return (
    <Button type="submit" variant="contained" color="primary" fullWidth disabled={pending || disabled}>
      <DiceSpinner size="small" loading={pending}>
        {children}
      </DiceSpinner>
    </Button>
  );
}
