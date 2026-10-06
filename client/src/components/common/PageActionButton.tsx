import { Button, type ButtonProps } from "@mui/material";

import { AddIcon } from "@/client/src/components/icons/index.ts";
import { glow } from "@/client/src/theme/shadows.ts";

type PageActionButtonProps = Omit<ButtonProps, "variant" | "size">;

/** The primary create action on a list page, in its header and in its empty state. */
export function PageActionButton({ children, sx, ...props }: PageActionButtonProps) {
  return (
    <Button
      variant="contained"
      size="large"
      startIcon={<AddIcon />}
      {...props}
      sx={[{ boxShadow: (theme) => glow(theme.palette.primary.main) }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Button>
  );
}
