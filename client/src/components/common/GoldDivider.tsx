import { Box, type SxProps, type Theme } from "@mui/material";

interface GoldDividerProps {
  /** Its place's size and strength: full width and 1px thick unless it says otherwise. */
  sx?: SxProps<Theme>;
}

/** The brand's gold rule between blocks (`palette.gold`), fading out at both ends. */
export function GoldDivider({ sx }: GoldDividerProps) {
  return (
    <Box
      sx={[
        {
          height: "1px",
          background: (theme) => `linear-gradient(90deg, transparent, ${theme.palette.gold.main}, transparent)`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
