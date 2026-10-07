import { Typography } from "@mui/material";

import { formatActivityDetails } from "@/client/src/lib/activityFormatters.ts";

interface ActivityDetailsProps {
  /** The activity's or the notification's data, whose changes it lists */
  data: unknown;
}

/** What an activity or a notification changed, under it: shown inline, since a tooltip never opens on a phone. */
export function ActivityDetails({ data }: ActivityDetailsProps) {
  const details = formatActivityDetails(data);
  return (
    details && (
      <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "pre-line" }}>
        {details}
      </Typography>
    )
  );
}
