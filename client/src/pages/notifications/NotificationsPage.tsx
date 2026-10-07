import {
  Box,
  Button,
  Container,
  Paper,
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
                borderColor: "rgba(255,255,255,0.5)",
                "&:hover": { borderColor: "common.white", bgcolor: "rgba(255,255,255,0.1)" },
                px: 3,
                py: 1.5,
                borderRadius: 2,
              }}
            >
              Mark all as read
            </Button>
          }
        />

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
          <>
            <TableContainer component={Paper} sx={{ mb: 3, overflowX: "auto" }}>
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
                        sx={{
                          "&:hover": openable ? { bgcolor: "action.hover" } : undefined,
                          ...(openable && CLICKABLE_SX),
                          ...(isUnread && { bgcolor: "action.selected" }),
                        }}
                      >
                        <TableCell>
                          <Tooltip
                            describeChild
                            title={formatActivityDetails(notification.data) ?? ""}
                            arrow
                            enterDelay={300}
                            slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              {isUnread && (
                                <CircleIcon
                                  titleAccess="Unread"
                                  sx={{ fontSize: 8, color: "primary.main", flexShrink: 0 }}
                                />
                              )}
                              <Typography variant="body2">
                                {formatNotificationMessage(notification.type, notification.data)}
                              </Typography>
                            </Box>
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
          </>
        ) : search ? (
          <NoMatchesState search={search} sx={{ mt: 4 }} />
        ) : (
          <BlankState
            icon={NotificationsIcon}
            title={unreadOnly ? "No unread notifications" : "No notifications yet"}
            description="Notifications from your campaigns and collaborators will appear here."
            sx={{ mt: 4 }}
          />
        )}
      </Container>
    </PageTransition>
  );
}
