import { Box, type BoxProps } from "@mui/material";

import { DURATION, EASING, fadeIn, PREFERS_REDUCED_MOTION } from "@/client/src/lib/animations.ts";

export function PageTransition({ children, sx, ...props }: BoxProps) {
  return (
    <Box
      sx={{
        animation: `${fadeIn} ${DURATION.normal}ms ${EASING.decelerate}`,
        [PREFERS_REDUCED_MOTION]: { animation: "none" },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}
