import { Notifications as NotificationsIcon, Check, Close } from "@mui/icons-material";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import {
  Box,
  Button,
  Paper,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useExportDownload, useInviteActions } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import {
  ACTIONABLE_NOTIFICATION_TYPES,
  DOWNLOADABLE_NOTIFICATION_TYPES,
  formatActivityDetails,
  formatNotificationMessage,
  formatRelativeTime,
} from "@/client/src/lib/activityFormatters.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";

type NotificationsResponse = InferResponseType<(typeof rpc.api.notifications)["$get"], 200>;
type NotificationItem = NotificationsResponse["items"][number];

export function RecentNotificationsCard() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const inviteActions = useInviteActions();
  const { downloadExport } = useExportDownload();

  const { data: notifications, isLoading } = useQuery({
    queryKey: queryKeys.notifications.list({ limit: 5, page: 1 }),
    queryFn: async () => {
      const response = await rpc.api.notifications.$get({
        query: { limit: "5", page: "1" },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      return response.json();
    },
  });

  const handleNavigate = async (notification: NotificationItem) => {
    inviteActions.markNotificationRead(notification.id);
    try {
      const response = await rpc.api.activities.resolve[":targetTable"][":targetId"].$get({
        param: { targetTable: notification.targetTable, targetId: notification.targetId },
      });
      const data = await response.json() as { url?: string | null };
      if (data.url) navigate(data.url);
      else snackbar.warning("The related entity may have been deleted");
    } catch (err) {
      // rpc client throws ApiError on non-2xx; surface its message.
      const message = err instanceof ApiError ? err.message : null;
      snackbar.warning(message || "Could not navigate to the related entity");
    }
  };

  const isActionable = (n: NotificationItem) =>
    ACTIONABLE_NOTIFICATION_TYPES.has(n.type) && !n.readAt;

  const isDownloadable = (n: NotificationItem) =>
    DOWNLOADABLE_NOTIFICATION_TYPES.has(n.type);

  const handleExportDownload = (notification: NotificationItem) => {
    const d = (notification.data ?? {}) as Record<string, unknown>;
    const exportId = d.exportId as string;
    const fileName = (d.fileName as string) || "export.pdf";
    downloadExport(notification.id, exportId, fileName);
  };

  if (isLoading) {
    return (
      <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <DiceSpinner />
        </Box>
      </Paper>
    );
  }

  if (!notifications?.items || notifications.items.length === 0) {
    return (
      <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }}>
            Notifications
          </Typography>
        </Box>
        <Box
          sx={{
            textAlign: "center",
            py: { xs: 3, sm: 6 },
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.background.paper}, ${theme.palette.background.default})`,
            borderRadius: 2,
            border: (theme) => `2px dashed ${theme.palette.primary.main}40`,
          }}
        >
          <Typography variant="h6" sx={{ color: "text.secondary" }}>
            No notifications yet
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }}>
          Notifications
        </Typography>
        <Button
          variant="outlined"
          startIcon={<NotificationsIcon />}
          onClick={() => navigate("/notifications")}
        >
          View All
        </Button>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {notifications.items.map((notification, index) => (
          <Box
            key={notification.id}
            onClick={isDownloadable(notification) ? () => handleExportDownload(notification) : !isActionable(notification) ? () => handleNavigate(notification) : undefined}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              p: 2,
              borderRadius: 2,
              bgcolor: notification.readAt ? "transparent" : "action.hover",
              cursor: isActionable(notification) && !isDownloadable(notification) ? "default" : "pointer",
              "&:hover": {
                bgcolor: "action.selected",
              },
              ...fadeInUpSx(index),
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: notification.readAt ? 400 : 600 }}>
                {formatNotificationMessage(notification.type, notification.data)}
              </Typography>
              {formatActivityDetails(notification.data) && (
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    mt: 0.5
                  }}>
                  {formatActivityDetails(notification.data)}
                </Typography>
              )}
              {isActionable(notification) && (
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<Check />}
                    onClick={() => inviteActions.acceptInvite(notification, (url) => navigate(url))}
                    disabled={inviteActions.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    startIcon={<Close />}
                    onClick={() => inviteActions.rejectInvite(notification)}
                    disabled={inviteActions.isPending}
                  >
                    Reject
                  </Button>
                </Box>
              )}
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                flexShrink: 0
              }}>
              {formatRelativeTime(notification.createdAt)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
