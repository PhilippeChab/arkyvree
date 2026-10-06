import { Badge, Box, Button, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { ANIMATIONS } from "@/client/src/lib/animations.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type UnreadNotification = InferResponseType<typeof rpc.api.notifications.unread.$get, 200>["items"][number];

interface NotificationSummaryProps {
  notification: UnreadNotification;
}

function NotificationSummary({ notification }: NotificationSummaryProps) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1, width: "100%" }}>
      <Typography variant="body2">{formatNotificationMessage(notification.type, notification.data)}</Typography>
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
        aria-label={formatCount(unreadCount, "unread notification")}
        sx={shake ? { animation: ANIMATIONS.bellShake } : undefined}
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
            <Box
              key="header"
              sx={{ px: 2, py: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
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
                    disabled={actions.isAnswering(notification)}
                  />
                </Box>
              ) : (
                <Tooltip
                  describeChild
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
              <Typography variant="body2" sx={{ color: "primary.main" }}>
                View all notifications
              </Typography>
            </MenuItem>,
          ]
        )}
      </Menu>
    </>
  );
}
