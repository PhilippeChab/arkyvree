import { Alert, type AlertProps, Collapse } from "@mui/material";

import { DURATION, EASING, fadeIn } from "@/client/src/lib/animations.ts";

interface AnimatedAlertProps extends AlertProps {
  in: boolean;
}

export function AnimatedAlert({ in: show, sx, ...alertProps }: AnimatedAlertProps) {
  return (
    <Collapse in={show}>
      <Alert {...alertProps} sx={{ animation: `${fadeIn} ${DURATION.normal}ms ${EASING.standard}`, ...sx }} />
    </Collapse>
  );
}
