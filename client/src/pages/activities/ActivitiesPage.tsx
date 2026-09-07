import {
  BlankState,
  PageTransition,
  SearchBar,
  DiceSpinner,
  type SortOption,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue, usePageTitle } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import {
  formatActivityDate,
  formatActivityDetails,
  formatActivityType,
} from "@/client/src/lib/activityFormatters.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { History as HistoryIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
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
import type { InferResponseType } from "hono/client";
import { useNavigate, useSearchParams } from "react-router-dom";

type ActivityResponse = InferResponseType<typeof rpc.api.activities.$get>;
type ActivityPaginated = Extract<Exclude<ActivityResponse, { error: string }>, { items: unknown[] }>;

type SortField = "createdAt" | "type";
type SortDirection = "asc" | "desc";

const NON_NAVIGABLE_TABLES = new Set(["users", "sessions"]);

const ACTIVITY_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "type", direction: "asc", label: "Type (A-Z)" },
  { field: "type", direction: "desc", label: "Type (Z-A)" },
];

async function resolveActivityUrl(targetTable: string, targetId: string): Promise<string | null> {
  try {
    const response = await rpc.api.activities.resolve[":targetTable"][":targetId"].$get({
      param: { targetTable, targetId },
    });
    const data = await response.json();
    return "url" in data ? data.url : null;
  } catch {
    return null;
  }
}

export default function ActivitiesPage() {
  usePageTitle("Activities");
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const limit = 10;

  // Get state from URL params
  const searchQuery = searchParams.get("search") || "";
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const rawOrderBy = searchParams.get("orderBy");
  const orderBy: SortField = rawOrderBy === "createdAt" || rawOrderBy === "type" ? rawOrderBy : "createdAt";
  const rawOrderDir = searchParams.get("orderDir");
  const orderDir: SortDirection = rawOrderDir === "asc" || rawOrderDir === "desc" ? rawOrderDir : "desc";

  // Update URL when filters change
  const updateURLParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== "all") {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    }

    setSearchParams(newParams);
  };

  const {
    data,
    isLoading: activitiesLoading,
    error: activitiesError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.activities.list({ search: debouncedSearchQuery, orderBy, orderDir }),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.activities.$get({
        query: {
          page: pageParam.toString(),
          limit: limit.toString(),
          search: debouncedSearchQuery || undefined,
          orderBy,
          orderDir,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch activities");
      }

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage as ActivityPaginated).nextPage,
    placeholderData: keepPreviousData,
  });

  const handleSortChange = (field: SortField, direction: SortDirection) => {
    updateURLParams({ orderBy: field, orderDir: direction });
  };

  // Flatten the pages into a single array of activities
  const activities = data?.pages.flatMap((page) => (page as ActivityPaginated).items) ?? [];

  if (activitiesLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (activitiesError) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">Failed to load activity logs.</Alert>
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
          <Typography sx={{ typography: { xs: "h4", md: "h3" }, fontWeight: 800, mb: 1 }}>
            Activity
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            View your activity history and track actions
          </Typography>
        </Paper>

        <SearchBar
          searchValue={searchQuery}
          onSearchChange={(value) => updateURLParams({ search: value || null })}
          searchPlaceholder="Search activity logs..."
          sortOptions={ACTIVITY_SORT_OPTIONS}
          sortField={orderBy}
          sortDirection={orderDir}
          onSortChange={handleSortChange}
        />

        {/* Activities Table */}
        {activities.length > 0 ? (
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
                    const isNavigable = !NON_NAVIGABLE_TABLES.has(activity.targetTable);
                    return (
                      <TableRow
                        key={activity.id}
                        onClick={isNavigable ? async () => {
                          const url = await resolveActivityUrl(activity.targetTable, activity.targetId);
                          if (url) navigate(url);
                          else snackbar.warning("This item has been deleted and is no longer available.");
                        } : undefined}
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
                          <Typography variant="body2" sx={{
                            color: "text.secondary"
                          }}>
                            {formatActivityDate(activity.createdAt)}
                          </Typography>
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
                  sx={{
                    px: 4,
                    py: 1.5,
                    borderRadius: 2,
                    fontWeight: 600,
                    borderWidth: 2,
                    "&:hover": {
                      borderWidth: 2,
                    },
                  }}
                >
                  <DiceSpinner size="small" loading={isFetchingNextPage}>Load More Activities</DiceSpinner>
                </Button>
              </Box>
            )}
          </>
        ) : (
          <BlankState
            icon={<HistoryIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2, opacity: 0.5 }} />}
            title="No activity logs found"
            description="Your activity history will appear here as you interact with the application."
            sx={{ mt: 4 }}
          />
        )}
      </Container>
    </PageTransition>
  );
}
