import { Box, Button, Paper, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BlankState, CLICKABLE_SX, clickableProps, DiceSpinner } from "@/client/src/components/common/index.ts";
import { NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { recentNotificationsQuery } from "@/client/src/lib/queries.ts";

export function RecentNotificationsCard() {
  const actions = useNotificationActions();

  const { data: notifications, isLoading } = useQuery(recentNotificationsQuery());

  const items = notifications?.items ?? [];

  return (
    <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography component="h2" sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }}>
          Notifications
        </Typography>
        {items.length > 0 && (
          <Button variant="outlined" startIcon={<NotificationsIcon />} component={Link} to="/notifications">
            View All
          </Button>
        )}
      </Box>
      {isLoading ? (
        <DiceSpinner sx={{ py: 4 }} />
      ) : items.length === 0 ? (
        <BlankState
          icon={NotificationsIcon}
          title="No notifications yet"
          description="Notifications from your campaigns and collaborators will appear here."
        />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {items.map((notification, index) => {
            const actionable = actions.isActionable(notification);
            const openable = actions.isOpenable(notification);
            const details = formatActivityDetails(notification.data);
            return (
              <Box
                key={notification.id}
                {...(openable && clickableProps(() => actions.open(notification)))}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: notification.readAt ? "transparent" : "action.hover",
                  ...(openable && CLICKABLE_SX),
                  "&:hover": openable ? { bgcolor: "action.selected" } : undefined,
                  ...fadeInUpSx(index),
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: notification.readAt ? 400 : 600 }}>
                    {formatNotificationMessage(notification.type, notification.data)}
                  </Typography>
                  {details && (
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", display: "block", mt: 0.5, whiteSpace: "pre-line" }}
                    >
                      {details}
                    </Typography>
                  )}
                  {actionable && (
                    <InviteActionButtons
                      sx={{ mt: 1 }}
                      onAccept={() => actions.accept(notification)}
                      onReject={() => actions.reject(notification)}
                      disabled={actions.isAnswering(notification)}
                    />
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
                  {formatRelativeTime(notification.createdAt)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
