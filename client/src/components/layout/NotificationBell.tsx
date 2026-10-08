import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import { NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { NotificationMessage } from "@/client/src/components/notifications/index.ts";
import { useAnchorMenu, useNotificationActions } from "@/client/src/hooks/index.ts";
import { ONE_MINUTE } from "@/client/src/lib/durations.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { ANIMATIONS, DURATION, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

import { unreadNotificationsQuery } from "./notificationBellQueries.ts";

interface NotificationSummaryProps {
  notification: UnreadNotification;
}

type UnreadNotification = InferResponseType<typeof rpc.api.notifications.unread.$get, 200>["items"][number];

/** A notification's row: a touch target's height on a phone, as a menu's item */
const ROW_SX = { py: 1.5, minHeight: { xs: 48, sm: "auto" } } as const;

/** The link to every notification, under the list */
const LINK_ROW_SX = { ...ROW_SX, py: 0.75, justifyContent: "center" } as const;

function NotificationSummary({ notification }: NotificationSummaryProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline", width: "100%" }}>
      {/* The bell lists unread ones alone: no dot */}
      <NotificationMessage notification={notification} />
      <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
        {formatRelativeTime(notification.createdAt)}
      </Typography>
    </Stack>
  );
}

export function NotificationBell() {
  const menu = useAnchorMenu();
  const navigate = useNavigate();
  const actions = useNotificationActions();

  const { data: unreadData, error } = useQuery({ ...unreadNotificationsQuery(), refetchInterval: ONE_MINUTE });

  const unreadCount = unreadData?.count ?? 0;
  const notifications = unreadData?.items ?? [];
  const prevCountRef = useRef<number | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (unreadData === undefined) return;
    if (prevCountRef.current !== null && unreadCount > prevCountRef.current) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), DURATION.ring);
      prevCountRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, unreadData]);

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          size="large"
          color="inherit"
          onClick={menu.openMenu}
          aria-label={formatCount(unreadCount, "unread notification")}
          sx={{ animation: shake ? ANIMATIONS.bellShake : undefined, [PREFERS_REDUCED_MOTION]: { animation: "none" } }}
          onAnimationEnd={() => setShake(false)}
        >
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      {/* A panel, not a menu: its heading, its list, and a link to the whole page */}
      <Popover
        anchorEl={menu.anchorEl}
        open={menu.open}
        onClose={menu.closeMenu}
        // Under the bell, as a menu opens
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Notifications",
            sx: { width: { xs: "90vw", sm: 450 }, maxHeight: 480 },
          },
        }}
      >
        <Stack sx={{ py: 1 }}>
          {error && !unreadData ? (
            <Box sx={{ px: 2, py: 1.5 }}>
              <LoadError what="Notifications" error={error} />
            </Box>
          ) : notifications.length === 0 ? (
            <BlankNote sx={{ px: 2, py: 1.5 }}>No unread notifications</BlankNote>
          ) : (
            <>
              <Stack direction="row" sx={{ px: 2, py: 1, justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="subtitle2" component="p" sx={{ color: "text.secondary" }}>
                  Notifications
                </Typography>
                <Button
                  size="small"
                  onClick={() => actions.markAllRead.mutate(undefined, { onSuccess: menu.closeMenu })}
                  disabled={actions.markAllRead.isPending}
                >
                  <DiceSpinner size="small" loading={actions.markAllRead.isPending}>
                    Mark All as Read
                  </DiceSpinner>
                </Button>
              </Stack>
              <Divider />
              {notifications.map((notification) =>
                actions.isActionable(notification) ? (
                  <Stack key={notification.id} spacing={1} sx={{ px: 2, py: 1.5 }}>
                    <NotificationSummary notification={notification} />
                    <InviteActionButtons
                      onAccept={() => actions.accept(notification, (path) => menu.closeMenuAnd(() => navigate(path))())}
                      onReject={() => actions.reject(notification)}
                      pending={actions.answering(notification)}
                    />
                  </Stack>
                ) : (
                  <ListItemButton
                    key={notification.id}
                    onClick={menu.closeMenuAnd(() => actions.open(notification))}
                    sx={ROW_SX}
                  >
                    <NotificationSummary notification={notification} />
                  </ListItemButton>
                ),
              )}
              <Divider />
              <ListItemButton component={Link} to="/notifications" onClick={menu.closeMenu} sx={LINK_ROW_SX}>
                <Typography variant="body2" sx={{ color: "primary.main" }}>
                  View All Notifications
                </Typography>
              </ListItemButton>
            </>
          )}
        </Stack>
      </Popover>
    </>
  );
}
