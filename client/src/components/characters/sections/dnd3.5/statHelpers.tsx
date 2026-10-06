import { Stack, Typography } from "@mui/material";

interface StatFieldProps {
  label: string;
  value: string | number;
}

export function StatField({ label, value }: StatFieldProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
      <Typography
        variant="body2"
        sx={{ fontWeight: "fontWeightMedium", color: "text.secondary", whiteSpace: "nowrap" }}
      >
        {label}:
      </Typography>
      <Typography
        sx={{
          fontWeight: "fontWeightMedium",
          borderBottom: 1,
          borderColor: "divider",
          px: 1,
          minWidth: 40,
          whiteSpace: "nowrap",
        }}
      >
        {value ?? "—"}
      </Typography>
    </Stack>
  );
}
