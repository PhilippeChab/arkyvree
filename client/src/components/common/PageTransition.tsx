import { Box, type BoxProps } from "@mui/material";

import { DURATION, EASING, fadeIn, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

export function PageTransition({ children, sx, ...props }: BoxProps) {
  return (
    <Box
      sx={[
        {
          animation: `${fadeIn} ${DURATION.normal}ms ${EASING.decelerate}`,
          [PREFERS_REDUCED_MOTION]: { animation: "none" },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {children}
    </Box>
  );
}
