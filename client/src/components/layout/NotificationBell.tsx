import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage, formatRelativeTime } from "@/client/src/lib/activityFormatters.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Notifications as NotificationsIcon } from "@mui/icons-material";
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
import { keyframes } from "@mui/system";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
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

type UnreadNotification = InferResponseType<typeof rpc.api.notifications.unread.$get, 200>["items"][number];

function NotificationSummary({ notification }: { notification: UnreadNotification }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1, width: "100%" }}>
      <Typography variant="body2">
        {formatNotificationMessage(notification.type, notification.data)}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
        {formatRelativeTime(notification.createdAt)}
      </Typography>
    </Box>
  );
}

export function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const actions = useNotificationActions();

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: () => parseResponse(rpc.api.notifications.unread.$get()),
    refetchInterval: 60 * 1000,
  });

  const unreadCount = unreadData?.count ?? 0;
  const notifications = unreadData?.items ?? [];
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

  const closeAnd = (then: () => void) => {
    setAnchorEl(null);
    then();
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
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No unread notifications
            </Typography>
          </Box>
        ) : (
          [
            <Box key="header" sx={{ px: 2, py: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                Notifications
              </Typography>
              <Button
                size="small"
                onClick={() => actions.markAllRead.mutate(undefined, { onSuccess: () => setAnchorEl(null) })}
                disabled={actions.markAllRead.isPending}
              >
                Mark all read
              </Button>
            </Box>,
            <Divider key="divider" />,
            ...notifications.map((notification) =>
              actions.isActionable(notification) ? (
                <Box key={notification.id} sx={{ px: 2, py: 1.5 }}>
                  <NotificationSummary notification={notification} />
                  <InviteActionButtons
                    sx={{ mt: 1 }}
                    onAccept={() => actions.accept(notification, (path) => closeAnd(() => navigate(path)))}
                    onReject={() => actions.reject(notification)}
                    disabled={actions.isInvitePending}
                  />
                </Box>
              ) : (
                <Tooltip
                  key={notification.id}
                  title={formatActivityDetails(notification.data) ?? ""}
                  arrow
                  enterDelay={300}
                  placement="left"
                  slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
                >
                  <MenuItem
                    onClick={() => closeAnd(() => actions.open(notification))}
                    sx={{ py: 1.5, whiteSpace: "normal" }}
                  >
                    <NotificationSummary notification={notification} />
                  </MenuItem>
                </Tooltip>
              ),
            ),
            <Divider key="divider-bottom" />,
            <MenuItem
              key="view-all"
              onClick={() => closeAnd(() => navigate("/notifications"))}
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
