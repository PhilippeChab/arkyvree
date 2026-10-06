import { History as HistoryIcon } from "@mui/icons-material";
import {
  Chip,
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
  LoadError,
  LoadMoreButton,
  NoMatchesState,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
} from "@/client/src/components/common/index.ts";
import { isNavigableTarget, useListParams, useOpenActivityTarget, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatActivityDate, formatActivityDetails, formatActivityType } from "@/client/src/lib/activityFormatters.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type SortField = "createdAt" | "type";

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

        {isLoading ? (
          <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />
        ) : error ? (
          <LoadError what="Activity logs" error={error} />
        ) : activities.length > 0 ? (
          <>
            <TableContainer component={Paper} sx={{ mb: 3, overflowX: "auto" }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <strong>Action</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Date</strong>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activities.map((activity) => {
                    const isNavigable = isNavigableTarget(activity.targetTable);
                    return (
                      <TableRow
                        key={activity.id}
                        {...(isNavigable && clickableProps(() => openTarget(activity.targetTable, activity.targetId)))}
                        sx={{
                          "&:hover": { bgcolor: "action.hover" },
                          ...(isNavigable && CLICKABLE_SX),
                        }}
                      >
                        <TableCell>
                          <Tooltip
                            describeChild
                            title={formatActivityDetails(activity.data) ?? ""}
                            arrow
                            enterDelay={300}
                            slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
                          >
                            <Chip
                              label={formatActivityType(activity.type, activity.data)}
                              size="small"
                              sx={{ fontWeight: 500 }}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {formatActivityDate(activity.createdAt)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <LoadMoreButton
              size="large"
              label="Load More Activities"
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            />
          </>
        ) : search ? (
          <NoMatchesState search={search} sx={{ mt: 4 }} />
        ) : (
          <BlankState
            icon={HistoryIcon}
            title="No activity logs found"
            description="Your activity history will appear here as you interact with the application."
            sx={{ mt: 4 }}
          />
        )}
      </Container>
    </PageTransition>
  );
}
