import {
  alpha,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import {
  BlankState,
  CLICKABLE_SX,
  clickableProps,
  CREATED_SORTS,
  DiceSpinner,
  type FilterOption,
  LoadError,
  LoadMoreButton,
  NoMatchesState,
  PageHeader,
  PageTransition,
  SearchBar,
} from "@/client/src/components/common/index.ts";
import { CircleIcon, NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useListParams, useNotificationActions, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
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

  const unreadOnly = searchParams.get("filter") === "unread";

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...notificationListQuery({ search, orderDir, unreadOnly }),
    placeholderData: keepPreviousData,
  });

  const notifications = pageItems(data);

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
                Mark all as read
              </Button>
            }
          />
          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search notifications..."
              filterOptions={FILTER_OPTIONS}
              filterValue={unreadOnly ? "unread" : undefined}
              onFilterChange={(value) => updateSearchParams({ filter: value })}
              sortOptions={CREATED_SORTS}
              sortField="createdAt"
            />

            {isLoading ? (
              <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />
            ) : error ? (
              <LoadError what="Notifications" error={error} />
            ) : notifications.length > 0 ? (
              // With nothing more to load, the page ends three units below the table, as the table's margin left it
              <Stack spacing={3} sx={{ pb: hasNextPage ? 0 : 3 }}>
                <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <strong>Notification</strong>
                        </TableCell>
                        <TableCell>
                          <strong>When</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Actions</strong>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {notifications.map((notification) => {
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
                                  disabled={actions.isAnswering(notification)}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <LoadMoreButton
                  size="large"
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                />
              </Stack>
            ) : search ? (
              // An empty page's state sits a unit lower than its table, as its margin placed it
              <Box sx={{ pt: 1 }}>
                <NoMatchesState search={search} />
              </Box>
            ) : (
              <Box sx={{ pt: 1 }}>
                <BlankState
                  icon={NotificationsIcon}
                  title={unreadOnly ? "No unread notifications" : "No notifications yet"}
                  description="Notifications from your campaigns and collaborators will appear here."
                />
              </Box>
            )}
          </Stack>
        </Stack>
      </Container>
    </PageTransition>
  );
}
