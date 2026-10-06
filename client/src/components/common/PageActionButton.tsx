import { Button, type ButtonProps } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { AddIcon } from "@/client/src/components/icons/index.ts";

type PageActionButtonProps = Omit<ButtonProps, "variant" | "size">;

/** The primary create action on a list page, in its header and in its empty state. */
export function PageActionButton({ children, sx, ...props }: PageActionButtonProps) {
  return (
    <Button
      variant="contained"
      size="large"
      startIcon={<AddIcon />}
      {...props}
      sx={[
        {
          px: 3,
          py: 1.5,
          borderRadius: 2,
          boxShadow: (theme) => `0 4px 14px 0 ${alpha(theme.palette.primary.main, 0.25)}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Button>
  );
}
