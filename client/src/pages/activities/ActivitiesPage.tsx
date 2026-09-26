import {
  BlankState,
  LoadMoreButton,
  PageHeader,
  PageTransition,
  SearchBar,
  DiceSpinner,
  type SortOption,
} from "@/client/src/components/common/index.ts";
import {
  isNavigableTarget,
  useDebouncedValue,
  useOpenActivityTarget,
  usePageTitle,
  useUpdateSearchParams,
} from "@/client/src/hooks/index.ts";
import {
  formatActivityDate,
  formatActivityDetails,
  formatActivityType,
} from "@/client/src/lib/activityFormatters.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { History as HistoryIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
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
import { useSearchParams } from "react-router-dom";

type SortField = "createdAt" | "type";

const ACTIVITY_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "type", direction: "asc", label: "Type (A-Z)" },
  { field: "type", direction: "desc", label: "Type (Z-A)" },
];

const PAGE_SIZE = 10;

export default function ActivitiesPage() {
  usePageTitle("Activities");
  const openTarget = useOpenActivityTarget();
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const orderBy = oneOf(searchParams.get("orderBy"), ["createdAt", "type"], "createdAt");
  const orderDir = oneOf(searchParams.get("orderDir"), ["asc", "desc"], "desc");

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.activities.list({ search: debouncedSearchQuery, orderBy, orderDir }),
    queryFn: ({ pageParam }) => parseResponse(rpc.api.activities.$get({
      query: {
        page: pageParam.toString(),
        limit: PAGE_SIZE.toString(),
        search: debouncedSearchQuery || undefined,
        orderBy,
        orderDir,
      },
    })),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const activities = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <PageHeader title="Activity" subtitle="View your activity history and track actions" />

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateSearchParams({ search: value }, { replace: true })}
          searchPlaceholder="Search activity logs..."
          sortOptions={ACTIVITY_SORT_OPTIONS}
          sortField={orderBy}
          sortDirection={orderDir}
          onSortChange={(field, direction) => updateSearchParams({ orderBy: field, orderDir: direction })}
        />

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 4, sm: 8 } }}>
            <DiceSpinner />
          </Box>
        ) : error ? (
          <Alert severity="error">Failed to load activity logs.</Alert>
        ) : activities.length > 0 ? (
          <>
            <TableContainer component={Paper} sx={{ mb: 3, overflowX: "auto" }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Action</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activities.map((activity) => {
                    const isNavigable = isNavigableTarget(activity.targetTable);
                    return (
                      <TableRow
                        key={activity.id}
                        onClick={isNavigable ? () => openTarget(activity.targetTable, activity.targetId) : undefined}
                        sx={{
                          "&:hover": { bgcolor: "action.hover" },
                          cursor: isNavigable ? "pointer" : "default",
                        }}
                      >
                        <TableCell>
                          <Tooltip title={formatActivityDetails(activity.data) ?? ""} arrow enterDelay={300} slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}>
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
