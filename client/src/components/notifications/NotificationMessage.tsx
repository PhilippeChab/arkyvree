import { Stack, Typography } from "@mui/material";

import { CircleIcon } from "@/client/src/components/icons/index.ts";
import { formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";

import { ActivityDetails } from "./ActivityDetails.tsx";

interface NotificationMessageProps {
  notification: { data: unknown; type: string };
  /** Led by the unread dot: where read and unread ones list together (the page, the dashboard's card) */
  unread?: boolean;
}

/**
 * What a notification says, one way wherever it shows (its page, the dashboard's card, the bell's panel): its message,
 * its details under it, shown inline since a tooltip never opens on a phone, and the unread dot before them.
 */
export function NotificationMessage({ notification, unread = false }: NotificationMessageProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", minWidth: 0 }}>
      {unread && <CircleIcon titleAccess="Unread" sx={{ fontSize: 8, color: "primary.main", flexShrink: 0 }} />}
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="body2">{formatNotificationMessage(notification.type, notification.data)}</Typography>
        <ActivityDetails type={notification.type} data={notification.data} />
      </Stack>
    </Stack>
  );
}
