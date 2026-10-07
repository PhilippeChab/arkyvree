import { Stack, Typography } from "@mui/material";

import { EmptyValue } from "@/client/src/components/common/index.ts";

interface StatFieldProps {
  label: string;
  value: string | number;
}

export function StatField({ label, value }: StatFieldProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
      <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary", whiteSpace: "nowrap" }}>
        {label}:
      </Typography>
      <Typography
        variant="body1"
        sx={{ fontWeight: 500, borderBottom: 1, borderColor: "divider", px: 1, minWidth: 40, whiteSpace: "nowrap" }}
      >
        {value ?? <EmptyValue />}
      </Typography>
    </Stack>
  );
}
