import { Button } from "@mui/material";
import type { ReactNode } from "react";

import { DiceSpinner } from "@/client/src/components/common/index.ts";

interface AuthSubmitButtonProps {
  loading: boolean;
  disabled?: boolean;
  children: ReactNode;
}

/** An auth form's full-width submit button, spinning while the request runs. */
export function AuthSubmitButton({ loading, disabled = false, children }: AuthSubmitButtonProps) {
  return (
    <Button type="submit" variant="contained" fullWidth disabled={loading || disabled}>
      <DiceSpinner size="small" loading={loading}>
        {children}
      </DiceSpinner>
    </Button>
  );
}
