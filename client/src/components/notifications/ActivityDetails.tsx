import { Typography } from "@mui/material";

import { useRules } from "@/client/src/hooks/index.ts";
import { formatActivityDetails } from "@/client/src/lib/activityFormatters.ts";

interface ActivityDetailsProps {
  /** The activity's or the notification's data, whose changes it lists */
  data: unknown;
  /** Its type, which says what its operator belongs to */
  type: string;
}

/**
 * What an activity or a notification changed, under it, named in its ruleset's rules: shown inline, since a tooltip
 * never opens on a phone.
 */
export function ActivityDetails({ type, data }: ActivityDetailsProps) {
  const { all: rules } = useRules();
  const details = formatActivityDetails(type, data, rules);
  return (
    details && (
      <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "pre-line" }}>
        {details}
      </Typography>
    )
  );
}
