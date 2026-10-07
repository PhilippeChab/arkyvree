import { Button, type ButtonProps } from "@mui/material";

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
          boxShadow: (theme) => theme.boxShadows.action,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Button>
  );
}
