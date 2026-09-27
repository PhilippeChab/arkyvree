import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Button } from "@mui/material";
import type { ReactNode } from "react";

/** An auth form's full-width submit button, spinning while the request runs. */
export function AuthSubmitButton({ loading, disabled = false, children }: { loading: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="submit" variant="contained" color="primary" fullWidth sx={{ mt: 2, mb: 2 }} disabled={loading || disabled}>
      <DiceSpinner size="small" loading={loading}>{children}</DiceSpinner>
    </Button>
  );
}
