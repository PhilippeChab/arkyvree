import { Notifications as NotificationsIcon } from "@mui/icons-material";
import { BlankState, DiceSpinner } from "@/client/src/components/common/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import {
  Box,
  Button,
  Paper,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import {
  formatActivityDetails,
  formatNotificationMessage,
  formatRelativeTime,
} from "@/client/src/lib/activityFormatters.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export function RecentNotificationsCard() {
  const navigate = useNavigate();
  const actions = useNotificationActions();

  const { data: notifications, isLoading } = useQuery({
    queryKey: queryKeys.notifications.list({ limit: 5, page: 1 }),
    queryFn: () => parseResponse(rpc.api.notifications.$get({ query: { limit: "5", page: "1" } })),
  });

  const items = notifications?.items ?? [];

  return (
    <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography component="h2" sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }}>
          Notifications
        </Typography>
        {items.length > 0 && (
          <Button
            variant="outlined"
            startIcon={<NotificationsIcon />}
            onClick={() => navigate("/notifications")}
          >
            View All
          </Button>
        )}
      </Box>
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <DiceSpinner />
        </Box>
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
                onClick={openable ? () => actions.open(notification) : undefined}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: notification.readAt ? "transparent" : "action.hover",
                  cursor: openable ? "pointer" : "default",
                  "&:hover": openable ? { bgcolor: "action.selected" } : undefined,
                  ...fadeInUpSx(index),
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: notification.readAt ? 400 : 600 }}>
                    {formatNotificationMessage(notification.type, notification.data)}
                  </Typography>
                  {details && (
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5, whiteSpace: "pre-line" }}>
                      {details}
                    </Typography>
                  )}
                  {actionable && (
                    <InviteActionButtons
                      sx={{ mt: 1 }}
                      onAccept={() => actions.accept(notification)}
                      onReject={() => actions.reject(notification)}
                      disabled={actions.isInvitePending}
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
