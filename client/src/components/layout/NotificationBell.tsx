import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { parseResponse } from "hono/client";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useNotificationActions } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { ANIMATIONS } from "@/client/src/lib/animations.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface NotificationSummaryProps {
  notification: UnreadNotification;
}

type UnreadNotification = InferResponseType<typeof rpc.api.notifications.unread.$get, 200>["items"][number];

function NotificationSummary({ notification }: NotificationSummaryProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline", width: "100%" }}>
      <Typography variant="body2">{formatNotificationMessage(notification.type, notification.data)}</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
        {formatRelativeTime(notification.createdAt)}
      </Typography>
    </Stack>
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
      <Popover
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Notifications",
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
          <>
            <Stack
              direction="row"
              spacing={1}
              sx={{ px: 2, py: 1, justifyContent: "space-between", alignItems: "center" }}
            >
              <Typography component="h2" variant="h5">
                Notifications
              </Typography>
              <Button
                size="small"
                onClick={() => actions.markAllRead.mutate(undefined, { onSuccess: () => setAnchorEl(null) })}
                disabled={actions.markAllRead.isPending}
              >
                <DiceSpinner size="small" loading={actions.markAllRead.isPending}>
                  Mark All as Read
                </DiceSpinner>
              </Button>
            </Stack>
            <Divider />
            <List disablePadding>
              {notifications.map((notification) =>
                actions.isActionable(notification) ? (
                  <ListItem key={notification.id} sx={{ px: 2, py: 1.5 }}>
                    <Stack spacing={1} sx={{ flex: 1 }}>
                      <NotificationSummary notification={notification} />
                      <InviteActionButtons
                        onAccept={() => actions.accept(notification, (path) => closeAnd(() => navigate(path)))}
                        onReject={() => actions.reject(notification)}
                        disabled={actions.isAnswering(notification)}
                      />
                    </Stack>
                  </ListItem>
                ) : (
                  <Tooltip
                    describeChild
                    key={notification.id}
                    title={formatActivityDetails(notification.data) ?? ""}
                    placement="left"
                  >
                    <ListItemButton onClick={() => closeAnd(() => actions.open(notification))} sx={{ py: 1.5 }}>
                      <NotificationSummary notification={notification} />
                    </ListItemButton>
                  </Tooltip>
                ),
              )}
            </List>
            <Divider />
            <Button component={Link} to="/notifications" onClick={() => setAnchorEl(null)} fullWidth>
              View All
            </Button>
          </>
        )}
      </Popover>
    </>
  );
}
