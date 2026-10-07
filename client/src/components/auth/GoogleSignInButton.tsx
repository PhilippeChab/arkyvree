import { Box, Button } from "@mui/material";
import { type RefObject } from "react";

interface GoogleSignInButtonProps {
  disabled?: boolean;
  fullWidth?: boolean;
  label?: string;
  overlayRef: RefObject<HTMLDivElement | null>;
}

/** Google's mark, as Google draws it. */
function GoogleIcon() {
  return <Box component="img" src="/google-mark.svg" alt="" sx={{ width: 18, height: 18 }} />;
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
        startIcon={<GoogleIcon />}
        sx={{
          textTransform: "none",
          fontSize: "0.938rem",
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
