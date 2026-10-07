import { Alert, type AlertProps, Box, Collapse } from "@mui/material";

import { DURATION, EASING, fadeIn, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface AnimatedAlertProps extends AlertProps {
  /** The space under the alert, in the theme's units, which opens and closes with it. */
  gutter?: number;
  in: boolean;
}

export function AnimatedAlert({ in: show, gutter = 0, sx, ...alertProps }: AnimatedAlertProps) {
  return (
    <Collapse in={show}>
      <Box sx={{ pb: gutter }}>
        <Alert
          {...alertProps}
          sx={[
            {
              animation: `${fadeIn} ${DURATION.moderate}ms ${EASING.easeIn}`,
              [PREFERS_REDUCED_MOTION]: { animation: "none" },
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        />
      </Box>
    </Collapse>
  );
}
