import { Typography } from "@mui/material";

import { LinkButton } from "@/client/src/components/common/index.ts";

interface ResendCodeLinkProps {
  disabled: boolean;
  onResend: () => void;
}

/** "Didn't receive the code? Resend" under a verification code form. */
export function ResendCodeLink({ onResend, disabled }: ResendCodeLinkProps) {
  return (
    <Typography variant="body2">
      Didn't receive the code?{" "}
      <LinkButton onClick={onResend} disabled={disabled} sx={{ verticalAlign: "baseline", font: "inherit" }}>
        Resend
      </LinkButton>
    </Typography>
  );
}
