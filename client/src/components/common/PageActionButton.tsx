import { Add as AddIcon } from "@mui/icons-material";
import { Button, type ButtonProps } from "@mui/material";

/** The primary create action on a list page, in its header and in its empty state. */
export function PageActionButton({ children, sx, ...props }: Omit<ButtonProps, "variant" | "size">) {
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
          boxShadow: (theme) => `0 4px 14px 0 ${theme.palette.primary.main}40`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Button>
  );
}
