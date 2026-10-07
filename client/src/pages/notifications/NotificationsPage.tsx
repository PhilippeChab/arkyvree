import {
  alpha,
  Button,
  Container,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";

import {
  BlankState,
  CLICKABLE_SX,
  clickableProps,
  CREATED_SORTS,
  DiceSpinner,
  type FilterOption,
  ListPageResults,
  PageHeader,
  PageTransition,
  SearchBar,
  TableFrame,
} from "@/client/src/components/common/index.ts";
import { CircleIcon, NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useListPageQuery, useListParams, useNotificationActions, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { notificationListQuery } from "@/client/src/lib/queries.ts";

const FILTER_OPTIONS: FilterOption<"unread">[] = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
];

export default function NotificationsPage() {
  usePageTitle("Notifications");
  const actions = useNotificationActions();
  const { searchParams, updateSearchParams, search, orderDir, searchBarProps } = useListParams(["createdAt"], {
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const unreadOnly = oneOf(searchParams.get("filter"), ["unread"]) === "unread";

  const notifications = useListPageQuery(notificationListQuery({ search, orderDir, unreadOnly }));

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Stack spacing={4}>
          <PageHeader
            title="Notifications"
            subtitle="Updates from your campaigns and rulesets"
            action={
              <Button
                variant="outlined"
                size="large"
                onClick={() => actions.markAllRead.mutate()}
                disabled={actions.markAllRead.isPending}
                sx={{
                  color: "common.white",
                  borderColor: (theme) => alpha(theme.palette.common.white, 0.5),
                  "&:hover": {
                    borderColor: "common.white",
                    bgcolor: (theme) => alpha(theme.palette.common.white, 0.1),
                  },
                  px: 3,
                  py: 1.5,
                  borderRadius: 2,
                }}
              >
                <DiceSpinner size="small" loading={actions.markAllRead.isPending}>
                  Mark All as Read
                </DiceSpinner>
              </Button>
            }
          />
          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search notifications…"
              filterOptions={FILTER_OPTIONS}
              filterValue={unreadOnly ? "unread" : undefined}
              onFilterChange={(value) => updateSearchParams({ filter: value })}
              sortOptions={CREATED_SORTS}
              sortField="createdAt"
            />

            <ListPageResults
              list={notifications}
              what="Notifications"
              search={search}
              // An empty page's state sits a unit lower than its table, as its margin placed it
              emptySx={{ pt: 1 }}
              empty={
                <BlankState
                  icon={NotificationsIcon}
                  title={unreadOnly ? "No unread notifications" : "No notifications yet"}
                  description="Notifications from your campaigns and collaborators will appear here."
                />
              }
            >
              <TableFrame>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Notification</TableCell>
                      <TableCell>When</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {notifications.items.map((notification) => {
                      const isUnread = !notification.readAt;
                      const openable = actions.isOpenable(notification);

                      return (
                        <TableRow
                          key={notification.id}
                          {...(openable && clickableProps(() => actions.open(notification)))}
                          sx={[
                            openable && { "&:hover": { bgcolor: "action.hover" } },
                            openable && CLICKABLE_SX,
                            isUnread && { bgcolor: "action.selected" },
                          ]}
                        >
                          <TableCell>
                            <Tooltip
                              describeChild
                              title={formatActivityDetails(notification.data) ?? ""}
                              arrow
                              enterDelay={300}
                              slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
                            >
                              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                {isUnread && (
                                  <CircleIcon
                                    titleAccess="Unread"
                                    sx={{ fontSize: 8, color: "primary.main", flexShrink: 0 }}
                                  />
                                )}
                                <Typography variant="body2">
                                  {formatNotificationMessage(notification.type, notification.data)}
                                </Typography>
                              </Stack>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                              {formatRelativeTime(notification.createdAt)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {actions.isActionable(notification) && (
                              <InviteActionButtons
                                onAccept={() => actions.accept(notification)}
                                onReject={() => actions.reject(notification)}
                                pending={actions.answering(notification)}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableFrame>
            </ListPageResults>
          </Stack>
        </Stack>
      </Container>
    </PageTransition>
  );
}
