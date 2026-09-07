import { Box, Typography } from "@mui/material";

export function fmt(v?: number): string {
  if (v === undefined) return "+0";
  return v >= 0 ? `+${v}` : `${v}`;
}

export function StatField({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
      <Typography
        variant="body2"
        sx={{ fontWeight: 500, color: "text.secondary", whiteSpace: "nowrap" }}
      >
        {label}:
      </Typography>
      <Typography
        variant="body1"
        sx={{ fontWeight: 500, borderBottom: 1, borderColor: "divider", px: 1, minWidth: 40, whiteSpace: "nowrap" }}
      >
        {value ?? "—"}
      </Typography>
    </Box>
  );
}
