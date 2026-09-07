import { ACTIONABLE_NOTIFICATION_TYPES, DOWNLOADABLE_NOTIFICATION_TYPES, formatActivityDetails, formatNotificationMessage, formatRelativeTime } from "@/client/src/lib/activityFormatters.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useExportDownload, useInviteActions } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { Check, Close, Notifications as NotificationsIcon } from "@mui/icons-material";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { keyframes } from "@mui/system";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const bellShake = keyframes`
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(14deg); }
  30% { transform: rotate(-12deg); }
  45% { transform: rotate(10deg); }
  60% { transform: rotate(-8deg); }
  75% { transform: rotate(4deg); }
`;

type NotificationsResponse = InferResponseType<(typeof rpc.api.notifications)["$get"], 200>;
type NotificationItem = NotificationsResponse["items"][number];

export function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const inviteActions = useInviteActions();
  const { downloadExport } = useExportDownload();

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: async () => {
      const response = await rpc.api.notifications.unread.$get();
      if (!response.ok) throw new Error("Failed to fetch unread summary");
      return response.json();
    },
    enabled: !!user?.id,
    refetchInterval: 60 * 1000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.notifications["read-all"].$post();
      if (!response.ok) throw new Error("Failed to mark all read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      setAnchorEl(null);
    },
    onError: (err) => snackbar.error(err, "Failed to mark all notifications as read"),
  });

  const unreadCount = unreadData?.count ?? 0;
  const prevCountRef = useRef<number | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (unreadData === undefined) return;
    if (prevCountRef.current !== null && unreadCount > prevCountRef.current) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 600);
      prevCountRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, unreadData]);
  const notifications = unreadData?.items ?? [];

  const isActionable = (n: NotificationItem) =>
    ACTIONABLE_NOTIFICATION_TYPES.has(n.type) && !n.readAt;

  const isDownloadable = (n: NotificationItem) =>
    DOWNLOADABLE_NOTIFICATION_TYPES.has(n.type);

  const handleExportDownload = (notification: NotificationItem) => {
    const d = (notification.data ?? {}) as Record<string, unknown>;
    const exportId = d.exportId as string;
    const fileName = (d.fileName as string) || "export.pdf";
    setAnchorEl(null);
    downloadExport(notification.id, exportId, fileName);
  };

  const handleNavigate = async (notification: NotificationItem) => {
    inviteActions.markNotificationRead(notification.id);
    setAnchorEl(null);
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

  const onNavigate = (url: string) => {
    setAnchorEl(null);
    navigate(url);
  };

  return (
    <>
      <IconButton
        size="large"
        color="inherit"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={`${unreadCount} unread notifications`}
        sx={shake ? { animation: `${bellShake} 0.6s ease-in-out` } : undefined}
        onAnimationEnd={() => setShake(false)}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: { width: { xs: "90vw", sm: 450 }, maxHeight: 480 },
          },
        }}
      >
        {notifications.length === 0 ? (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              No unread notifications
            </Typography>
          </Box>
        ) : (
          [
            <Box key="header" sx={{ px: 2, py: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="subtitle2" sx={{
                color: "text.secondary"
              }}>
                Notifications
              </Typography>
              <Button
                size="small"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                Mark all read
              </Button>
            </Box>,
            <Divider key="divider" />,
            ...notifications.map((notification) =>
              isActionable(notification) ? (
                <Box key={notification.id} sx={{ px: 2, py: 1.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                    <Typography variant="body2">
                      {formatNotificationMessage(notification.type, notification.data)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        flexShrink: 0
                      }}>
                      {formatRelativeTime(notification.createdAt)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<Check />}
                      onClick={() => inviteActions.acceptInvite(notification, onNavigate)}
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
                </Box>
              ) : isDownloadable(notification) ? (
                <MenuItem
                  key={notification.id}
                  onClick={() => handleExportDownload(notification)}
                  sx={{ py: 1.5, whiteSpace: "normal" }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1, width: "100%" }}>
                    <Typography variant="body2">
                      {formatNotificationMessage(notification.type, notification.data)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        flexShrink: 0
                      }}>
                      {formatRelativeTime(notification.createdAt)}
                    </Typography>
                  </Box>
                </MenuItem>
              ) : (
                <Tooltip key={notification.id} title={formatActivityDetails(notification.data) ?? ""} arrow enterDelay={300} placement="left" slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}>
                <MenuItem
                  onClick={() => handleNavigate(notification)}
                  sx={{ py: 1.5, whiteSpace: "normal" }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1, width: "100%" }}>
                    <Typography variant="body2">
                      {formatNotificationMessage(notification.type, notification.data)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        flexShrink: 0
                      }}>
                      {formatRelativeTime(notification.createdAt)}
                    </Typography>
                  </Box>
                </MenuItem>
              </Tooltip>
              ),
            ),
            <Divider key="divider-bottom" />,
            <MenuItem
              key="view-all"
              onClick={() => {
                setAnchorEl(null);
                navigate("/notifications");
              }}
              sx={{ justifyContent: "center" }}
            >
              <Typography variant="body2" color="primary">
                View all notifications
              </Typography>
            </MenuItem>,
          ]
        )}
      </Menu>
    </>
  );
}
