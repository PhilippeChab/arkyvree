import { Box, Button } from "@mui/material";

interface GoogleSignInButtonProps {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
  label?: string;
  fullWidth?: boolean;
}

export function GoogleSignInButton({
  overlayRef,
  disabled,
  label = "Continue with Google",
  fullWidth = true,
}: GoogleSignInButtonProps) {
  return (
    <Box
      sx={{
        position: "relative",
        width: fullWidth ? "100%" : "auto",
        "&:hover .MuiButton-root": {
          background: (theme) => theme.palette.action.hover,
        },
      }}
    >
      <Button
        fullWidth={fullWidth}
        disabled={disabled}
        startIcon={<Box component="img" src="/google-logo.svg" alt="" sx={{ width: 18, height: 18 }} />}
        sx={{
          typography: "body1",
          textTransform: "none",
          fontWeight: 500,
          py: 1.5,
          background: (theme) => theme.palette.background.paper,
          color: (theme) => theme.palette.text.secondary,
          border: 1,
          borderColor: "divider",
          boxShadow: "none",
          textShadow: "none",
        }}
      >
        {label}
      </Button>
      <Box
        ref={overlayRef}
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          opacity: 0.01,
          "& iframe": {
            width: "100% !important",
            height: "100% !important",
          },
        }}
      />
    </Box>
  );
}
