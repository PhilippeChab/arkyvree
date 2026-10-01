import { Alert, type AlertProps, Collapse } from "@mui/material";

import { fadeIn } from "@/client/src/lib/animations.ts";

interface AnimatedAlertProps extends AlertProps {
  in: boolean;
}

export function AnimatedAlert({ in: show, sx, ...alertProps }: AnimatedAlertProps) {
  return (
    <Collapse in={show}>
      <Alert {...alertProps} sx={{ animation: `${fadeIn} 300ms ease-in`, ...sx }} />
    </Collapse>
  );
}
