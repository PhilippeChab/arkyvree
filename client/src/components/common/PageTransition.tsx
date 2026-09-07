import { Box, type BoxProps } from "@mui/material";
import { DURATION, EASING, fadeIn, prefersReducedMotion } from "@/client/src/lib/animations.ts";

export function PageTransition({ children, sx, ...props }: BoxProps) {
  return (
    <Box
      sx={{
        animation: `${fadeIn} ${DURATION.normal}ms ${EASING.decelerate}`,
        [prefersReducedMotion]: { animation: "none" },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}
