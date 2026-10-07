import { Button, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  BlankNote,
  CardTitle,
  CLICKABLE_SX,
  clickableProps,
  DiceSpinner,
  LoadError,
  Panel,
} from "@/client/src/components/common/index.ts";
import { NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { NotificationMessage, UNREAD_NOTIFICATION_SX } from "@/client/src/components/notifications/index.ts";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { recentNotificationsQuery } from "@/client/src/pages/dashboard/dashboardQueries.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

export function RecentNotificationsCard() {
  const actions = useNotificationActions();

  const { data: notifications, isLoading, error } = useQuery(recentNotificationsQuery());

  const items = notifications?.items ?? [];

  return (
    <Panel>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <CardTitle>Notifications</CardTitle>
          {items.length > 0 && (
            <Button variant="outlined" startIcon={<NotificationsIcon />} component={Link} to="/notifications">
              View All
            </Button>
          )}
        </Stack>
        {isLoading ? (
          <DiceSpinner sx={{ py: 4 }} />
        ) : error && items.length === 0 ? (
          <LoadError what="Notifications" error={error} />
        ) : items.length === 0 ? (
          <BlankNote>No notifications yet</BlankNote>
        ) : (
          <Stack spacing={1.5}>
            {items.map((notification, index) => {
              const actionable = actions.isActionable(notification);
              const openable = actions.isOpenable(notification);
              return (
                <Stack
                  key={notification.id}
                  direction="row"
                  spacing={2}
                  {...(openable && clickableProps(() => actions.open(notification)))}
                  sx={[
                    { justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2 },
                    !notification.readAt && UNREAD_NOTIFICATION_SX,
                    openable && CLICKABLE_SX,
                    openable && { "&:hover": { bgcolor: "action.hover" } },
                    fadeInUpSx(index),
                  ]}
                >
                  <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                    <NotificationMessage notification={notification} unread={!notification.readAt} />
                    {actionable && (
                      <InviteActionButtons
                        onAccept={() => actions.accept(notification)}
                        onReject={() => actions.reject(notification)}
                        pending={actions.answering(notification)}
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
                    {formatRelativeTime(notification.createdAt)}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}
