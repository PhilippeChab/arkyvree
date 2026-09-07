import { fadeIn } from "@/client/src/lib/animations.ts";
import { Alert, type AlertProps, Collapse } from "@mui/material";

interface AnimatedAlertProps extends AlertProps {
  in: boolean;
}

export function AnimatedAlert({ in: show, sx, ...alertProps }: AnimatedAlertProps) {
  return (
    <Collapse in={show}>
      <Alert
        {...alertProps}
        sx={{ animation: `${fadeIn} 300ms ease-in`, ...sx }}
      />
    </Collapse>
  );
}
