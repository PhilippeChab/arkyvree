import {
  BlankState,
  LoadMoreButton,
  PageHeader,
  PageTransition,
  SearchBar,
  DiceSpinner,
  type FilterOption,
  type SortOption,
} from "@/client/src/components/common/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useDebouncedValue, useNotificationActions, usePageTitle, useUpdateSearchParams } from "@/client/src/hooks/index.ts";
import {
  formatActivityDetails,
  formatNotificationMessage,
  formatRelativeTime,
} from "@/client/src/lib/activityFormatters.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import {
  Notifications as NotificationsIcon,
  Circle as CircleIcon,
} from "@mui/icons-material";
import {
  Alert,
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
import { useSearchParams } from "react-router-dom";

const SORT_OPTIONS: SortOption<"createdAt">[] = [
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
];

const FILTER_OPTIONS: FilterOption<"unread">[] = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
];

const PAGE_SIZE = 10;

export default function NotificationsPage() {
  usePageTitle("Notifications");
  const actions = useNotificationActions();
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const searchQuery = searchParams.get("search") || "";
  const debouncedSearch = useDebouncedValue(searchQuery);
  const orderDir = searchParams.get("orderDir") === "asc" ? "asc" : "desc";
  const unreadOnly = searchParams.get("filter") === "unread";

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.notifications.list({ search: debouncedSearch, orderDir, unreadOnly }),
    queryFn: ({ pageParam }) => parseResponse(rpc.api.notifications.$get({
      query: {
        page: pageParam.toString(),
        limit: PAGE_SIZE.toString(),
        search: debouncedSearch || undefined,
        orderDir,
        ...(unreadOnly && { unreadOnly: "true" }),
      },
    })),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const notifications = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <PageHeader
          title="Notifications"
          subtitle="Updates from your campaigns and rulesets"
          action={(
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
          )}
        />

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateSearchParams({ search: value })}
          searchPlaceholder="Search notifications..."
          filterOptions={FILTER_OPTIONS}
          filterValue={unreadOnly ? "unread" : undefined}
          onFilterChange={(value) => updateSearchParams({ filter: value })}
          sortOptions={SORT_OPTIONS}
          sortField="createdAt"
          sortDirection={orderDir}
          onSortChange={(_, direction) => updateSearchParams({ orderDir: direction })}
        />

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 4, sm: 8 } }}>
            <DiceSpinner />
          </Box>
        ) : error ? (
          <Alert severity="error">Failed to load notifications.</Alert>
        ) : notifications.length > 0 ? (
          <>
            <TableContainer component={Paper} sx={{ mb: 3, overflowX: "auto" }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Notification</strong></TableCell>
                    <TableCell><strong>When</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notifications.map((notification) => {
                    const isUnread = !notification.readAt;
                    const openable = actions.isOpenable(notification);

                    return (
                      <TableRow
                        key={notification.id}
                        onClick={openable ? () => actions.open(notification) : undefined}
                        sx={{
                          "&:hover": openable ? { bgcolor: "action.hover" } : undefined,
                          cursor: openable ? "pointer" : "default",
                          ...(isUnread && { bgcolor: "action.selected" }),
                        }}
                      >
                        <TableCell>
                          <Tooltip title={formatActivityDetails(notification.data) ?? ""} arrow enterDelay={300} slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              {isUnread && (
                                <CircleIcon sx={{ fontSize: 8, color: "primary.main", flexShrink: 0 }} />
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
                              disabled={actions.isInvitePending}
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
        ) : (
          <BlankState
            icon={<NotificationsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2, opacity: 0.5 }} />}
            title={unreadOnly ? "No unread notifications" : "No notifications yet"}
            description="Notifications from your campaigns and collaborators will appear here."
            sx={{ mt: 4 }}
          />
        )}
      </Container>
    </PageTransition>
  );
}
