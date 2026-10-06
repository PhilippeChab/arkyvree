import { Container, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import {
  CREATED_SORTS,
  DataTable,
  type DataTableColumn,
  LoadError,
  LoadMoreButton,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  TagChip,
} from "@/client/src/components/common/index.ts";
import { ActivityIcon } from "@/client/src/components/icons/index.ts";
import { isNavigableTarget, useListParams, useOpenActivityTarget, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatActivityType } from "@/client/src/lib/activityFormatters.ts";
import { formatDateTime } from "@/client/src/lib/formatDate.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type SortField = "createdAt" | "type";

const ACTIVITY_COLUMNS: DataTableColumn[] = [
  { key: "action", label: "Action" },
  { key: "date", label: "Date" },
];

const ACTIVITY_SORT_OPTIONS: SortOption<SortField>[] = [
  ...CREATED_SORTS,
  { field: "type", direction: "asc", label: "Type (A-Z)" },
  { field: "type", direction: "desc", label: "Type (Z-A)" },
];

const PAGE_SIZE = 10;

export default function ActivitiesPage() {
  usePageTitle("Activities");
  const openTarget = useOpenActivityTarget();
  const { search, orderBy, orderDir, searchBarProps } = useListParams(["createdAt", "type"], {
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.activities.list({ search, orderBy, orderDir }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.activities.$get({
          query: {
            page: pageParam.toString(),
            limit: PAGE_SIZE.toString(),
            search: search || undefined,
            orderBy,
            orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const activities = pageItems(data);

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <PageHeader title="Activity" subtitle="View your activity history and track actions" />

        <SearchBar
          {...searchBarProps}
          searchPlaceholder="Search activity logs..."
          sortOptions={ACTIVITY_SORT_OPTIONS}
        />

        {error ? (
          <LoadError what="Activity logs" error={error} />
        ) : (
          <>
            <DataTable
              rows={activities}
              isLoading={isLoading}
              columns={ACTIVITY_COLUMNS}
              minWidth={0}
              renderCell={(activity, column) =>
                column === "date" ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {formatDateTime(activity.createdAt)}
                  </Typography>
                ) : (
                  <TagChip
                    tag={{
                      label: formatActivityType(activity.type, activity.data),
                      color: "default",
                      tooltip: formatActivityDetails(activity.data) ?? undefined,
                    }}
                  />
                )
              }
              onRowClick={(activity) => openTarget(activity.targetTable, activity.targetId)}
              isRowClickable={(activity) => isNavigableTarget(activity.targetTable)}
              search={search}
              empty={{
                icon: ActivityIcon,
                title: "No activity logs found",
                description: "Your activity history will appear here as you interact with the application.",
              }}
            />
            <LoadMoreButton
              size="large"
              label="Load More Activities"
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
