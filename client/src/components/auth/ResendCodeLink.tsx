import { Link as MuiLink, Typography } from "@mui/material";

interface ResendCodeLinkProps {
  onResend: () => void;
  disabled: boolean;
}

/** "Didn't receive the code? Resend" under a verification code form. */
export function ResendCodeLink({ onResend, disabled }: ResendCodeLinkProps) {
  return (
    <Typography variant="body2">
      Didn't receive the code?{" "}
      <MuiLink
        component="button"
        type="button"
        underline="hover"
        onClick={onResend}
        disabled={disabled}
        sx={{ verticalAlign: "baseline", font: "inherit" }}
      >
        Resend
      </MuiLink>
    </Typography>
  );
}
