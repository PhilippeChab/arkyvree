import {
  BlankState,
  PageTransition,
  SearchBar,
  DiceSpinner,
  type FilterOption,
  type SortOption,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useExportDownload, useInviteActions, usePageTitle } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import {
  ACTIONABLE_NOTIFICATION_TYPES,
  DOWNLOADABLE_NOTIFICATION_TYPES,
  formatActivityDetails,
  formatNotificationMessage,
  formatRelativeTime,
} from "@/client/src/lib/activityFormatters.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
import {
  Notifications as NotificationsIcon,
  Circle as CircleIcon,
  Check,
  Close,
} from "@mui/icons-material";
import {
  Alert,
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
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useNavigate, useSearchParams } from "react-router-dom";

type NotificationsResponse = InferResponseType<(typeof rpc.api.notifications)["$get"], 200>;
type NotificationItem = NotificationsResponse["items"][number];

type SortDirection = "asc" | "desc";

const SORT_OPTIONS: SortOption<"createdAt">[] = [
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
];

const FILTER_OPTIONS: FilterOption<"unread">[] = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
];

const NON_NAVIGABLE_TABLES = new Set(["users", "sessions"]);

type ResolveResult = { url: string } | { url: null; message?: string };

async function resolveUrl(targetTable: string, targetId: string): Promise<ResolveResult> {
  try {
    const response = await rpc.api.activities.resolve[":targetTable"][":targetId"].$get({
      param: { targetTable, targetId },
    });
    const data = await response.json() as { url?: string | null };
    if (data.url) return { url: data.url };
    return { url: null };
  } catch (err) {
    // The rpc client throws ApiError on non-2xx; surface its message
    // (e.g. "You no longer have access to this character.").
    if (err instanceof ApiError && err.message) return { url: null, message: err.message };
    return { url: null };
  }
}

export default function NotificationsPage() {
  usePageTitle("Notifications");
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const inviteActions = useInviteActions();
  const { downloadExport } = useExportDownload();
  const [searchParams, setSearchParams] = useSearchParams();
  const limit = 10;

  const searchQuery = searchParams.get("search") || "";
  const debouncedSearch = useDebouncedValue(searchQuery);
  const rawOrderDir = searchParams.get("orderDir");
  const orderDir: SortDirection = rawOrderDir === "asc" ? "asc" : "desc";
  const unreadOnly = searchParams.get("filter") === "unread";

  const updateURLParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) newParams.set(key, value);
      else newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.notifications.list({ search: debouncedSearch, orderDir, unreadOnly }),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.notifications.$get({
        query: {
          page: pageParam.toString(),
          limit: limit.toString(),
          search: debouncedSearch || undefined,
          orderDir,
          ...(unreadOnly && { unreadOnly: "true" }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch notifications");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await rpc.api.notifications[":id"].read.$post({ param: { id } });
      if (!response.ok) throw new Error("Failed to mark read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (err) => snackbar.error(err, "Failed to mark notification as read"),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.notifications["read-all"].$post();
      if (!response.ok) throw new Error("Failed to mark all read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (err) => snackbar.error(err, "Failed to mark all notifications as read"),
  });

  const notifications: NotificationItem[] = data?.pages.flatMap((page) => page.items) ?? [];

  const isActionable = (n: NotificationItem) =>
    ACTIONABLE_NOTIFICATION_TYPES.has(n.type) && !n.readAt;

  const isDownloadable = (n: NotificationItem) =>
    DOWNLOADABLE_NOTIFICATION_TYPES.has(n.type);

  const handleRowClick = async (notification: NotificationItem) => {
    if (NON_NAVIGABLE_TABLES.has(notification.targetTable)) return;
    if (isActionable(notification)) return;

    if (isDownloadable(notification)) {
      const d = (notification.data ?? {}) as Record<string, unknown>;
      const exportId = d.exportId as string;
      const fileName = (d.fileName as string) || "export.pdf";
      downloadExport(notification.id, exportId, fileName);
      return;
    }

    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }

    const result = await resolveUrl(notification.targetTable, notification.targetId);
    if (result.url !== null) {
      navigate(result.url);
    } else {
      snackbar.warning(result.message ?? "This item has been deleted and is no longer available.");
    }
  };

  const handleAccept = (notification: NotificationItem) => {
    inviteActions.acceptInvite(notification, (url) => navigate(url));
  };

  const handleReject = (notification: NotificationItem) => {
    inviteActions.rejectInvite(notification);
  };

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}><DiceSpinner /></Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Failed to load notifications.</Alert>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Paper
          sx={{
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: "white",
            p: { xs: 2, sm: 4 },
            borderRadius: 4,
            mb: 4,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "stretch", sm: "center" }
            }}>
            <Box>
              <Typography sx={{ typography: { xs: "h4", md: "h3" }, fontWeight: 800, mb: 1 }}>
                Notifications
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                Updates from your campaigns and rulesets
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="large"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              sx={{
                color: "white",
                borderColor: "rgba(255,255,255,0.5)",
                "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" },
                px: 3,
                py: 1.5,
                borderRadius: 2,
              }}
            >
              Mark all as read
            </Button>
          </Stack>
        </Paper>

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateURLParams({ search: value || null })}
          searchPlaceholder="Search notifications..."
          filterOptions={FILTER_OPTIONS}
          filterValue={unreadOnly ? "unread" : undefined}
          onFilterChange={(value) => updateURLParams({ filter: value === "unread" ? "unread" : null })}
          sortOptions={SORT_OPTIONS}
          sortField="createdAt"
          sortDirection={orderDir}
          onSortChange={(_, direction) => updateURLParams({ orderDir: direction })}
        />

        {notifications.length > 0 ? (
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
                    const actionable = isActionable(notification);

                    return (
                      <TableRow
                        key={notification.id}
                        onClick={!actionable ? () => handleRowClick(notification) : undefined}
                        sx={{
                          "&:hover": { bgcolor: "action.hover" },
                          cursor: actionable ? "default" : "pointer",
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
                          <Typography variant="body2" sx={{
                            color: "text.secondary"
                          }}>
                            {formatRelativeTime(notification.createdAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {actionable && (
                            <Box sx={{ display: "flex", gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<Check />}
                                onClick={() => handleAccept(notification)}
                                disabled={inviteActions.isPending}
                              >
                                Accept
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                color="error"
                                startIcon={<Close />}
                                onClick={() => handleReject(notification)}
                                disabled={inviteActions.isPending}
                              >
                                Reject
                              </Button>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {hasNextPage && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <Button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  variant="outlined"
                  size="large"
                  sx={{ px: 4, py: 1.5, borderRadius: 2, fontWeight: 600, borderWidth: 2, "&:hover": { borderWidth: 2 } }}
                >
                  <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
                </Button>
              </Box>
            )}
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
