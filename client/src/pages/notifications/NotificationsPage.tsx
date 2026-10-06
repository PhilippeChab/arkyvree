import { alpha, Button, Container, Stack, Tooltip, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import {
  CREATED_SORTS,
  DataTable,
  type DataTableColumn,
  DiceSpinner,
  type FilterOption,
  LoadError,
  LoadMoreButton,
  PageHeader,
  PageTransition,
  SearchBar,
} from "@/client/src/components/common/index.ts";
import { NotificationsIcon, UnreadIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { useListParams, useNotificationActions, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatNotificationMessage } from "@/client/src/lib/activityFormatters.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

const FILTER_OPTIONS: FilterOption<"unread">[] = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
];

const NOTIFICATION_COLUMNS: DataTableColumn[] = [
  { key: "notification", label: "Notification" },
  { key: "when", label: "When" },
  { key: "invite", label: "Actions" },
];

const PAGE_SIZE = 10;

export default function NotificationsPage() {
  usePageTitle("Notifications");
  const actions = useNotificationActions();
  const { searchParams, updateSearchParams, search, orderDir, searchBarProps } = useListParams(["createdAt"], {
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const unreadOnly = searchParams.get("filter") === "unread";

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.notifications.list({ search, orderDir, unreadOnly }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.notifications.$get({
          query: {
            page: pageParam.toString(),
            limit: PAGE_SIZE.toString(),
            search: search || undefined,
            orderDir,
            unreadOnly: unreadOnly ? "true" : undefined,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
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
                borderColor: (theme) => alpha(theme.palette.common.white, 0.5),
                "&:hover": { borderColor: "common.white", bgcolor: (theme) => alpha(theme.palette.common.white, 0.1) },
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

        <SearchBar
          {...searchBarProps}
          searchPlaceholder="Search notifications..."
          filterOptions={FILTER_OPTIONS}
          filterValue={unreadOnly ? "unread" : undefined}
          onFilterChange={(value) => updateSearchParams({ filter: value })}
          sortOptions={CREATED_SORTS}
          sortField="createdAt"
        />

        {error ? (
          <LoadError what="Notifications" error={error} />
        ) : (
          <>
            <DataTable
              rows={notifications}
              isLoading={isLoading}
              columns={NOTIFICATION_COLUMNS}
              minWidth={0}
              renderCell={(notification, column) => {
                if (column === "when") {
                  return (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {formatRelativeTime(notification.createdAt)}
                    </Typography>
                  );
                }
                if (column === "invite") {
                  return (
                    actions.isActionable(notification) && (
                      <InviteActionButtons
                        onAccept={() => actions.accept(notification)}
                        onReject={() => actions.reject(notification)}
                        disabled={actions.isAnswering(notification)}
                      />
                    )
                  );
                }
                return (
                  <Tooltip
                    describeChild
                    title={formatActivityDetails(notification.data) ?? ""}
                    slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      {!notification.readAt && (
                        <UnreadIcon titleAccess="Unread" fontSize="dot" sx={{ color: "primary.main", flexShrink: 0 }} />
                      )}
                      <Typography variant="body2">
                        {formatNotificationMessage(notification.type, notification.data)}
                      </Typography>
                    </Stack>
                  </Tooltip>
                );
              }}
              onRowClick={(notification) => actions.open(notification)}
              isRowClickable={(notification) => actions.isOpenable(notification)}
              rowSx={(notification) => (notification.readAt ? {} : { bgcolor: "action.selected" })}
              search={search}
              empty={{
                icon: NotificationsIcon,
                title: unreadOnly ? "No unread notifications" : "No notifications yet",
                description: "Notifications from your campaigns and collaborators will appear here.",
              }}
            />
            <LoadMoreButton
              size="large"
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            />
          </>
        )}
      </Container>
    </PageTransition>
  );
}
