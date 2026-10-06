import { Button, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Link } from "react-router-dom";

import { BlankState, CLICKABLE_SX, clickableProps, DiceSpinner } from "@/client/src/components/common/index.ts";
import { NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export function RecentNotificationsCard() {
  const actions = useNotificationActions();

  const { data: notifications, isLoading } = useQuery({
    queryKey: queryKeys.notifications.list({ limit: 5, page: 1 }),
    queryFn: () => parseResponse(rpc.api.notifications.$get({ query: { limit: "5", page: "1" } })),
  });

  const items = notifications?.items ?? [];

  return (
    <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography component="h2" sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }}>
            Notifications
          </Typography>
          {items.length > 0 && (
            <Button variant="outlined" startIcon={<NotificationsIcon />} component={Link} to={"/notifications"}>
              View All
            </Button>
          )}
        </Stack>
        {isLoading ? (
          <DiceSpinner sx={{ py: 4 }} />
        ) : items.length === 0 ? (
          <BlankState
            icon={NotificationsIcon}
            title="No notifications yet"
            description="Notifications from your campaigns and collaborators will appear here."
          />
        ) : (
          <Stack spacing={1.5}>
            {items.map((notification, index) => {
              const actionable = actions.isActionable(notification);
              const openable = actions.isOpenable(notification);
              const details = formatActivityDetails(notification.data);
              return (
                <Stack
                  key={notification.id}
                  {...(openable && clickableProps(() => actions.open(notification)))}
                  direction="row"
                  spacing={2}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 2,
                    borderRadius: 2,
                    bgcolor: notification.readAt ? "transparent" : "action.hover",
                    ...(openable && CLICKABLE_SX),
                    "&:hover": openable ? { bgcolor: "action.selected" } : undefined,
                    ...fadeInUpSx(index),
                  }}
                >
                  <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: notification.readAt ? 400 : 600 }}>
                      {formatNotificationMessage(notification.type, notification.data)}
                    </Typography>
                    {details && (
                      <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "pre-line" }}>
                        {details}
                      </Typography>
                    )}
                    {actionable && (
                      <InviteActionButtons
                        onAccept={() => actions.accept(notification)}
                        onReject={() => actions.reject(notification)}
                        disabled={actions.isAnswering(notification)}
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
    </Paper>
  );
}
