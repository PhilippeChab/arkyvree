import {
  Chip,
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
  ListPageResults,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  TableFrame,
} from "@/client/src/components/common/index.ts";
import { HistoryIcon } from "@/client/src/components/icons/index.ts";
import {
  isNavigableTarget,
  useListPageQuery,
  useListParams,
  useOpenActivityTarget,
  usePageTitle,
} from "@/client/src/hooks/index.ts";
import { formatActivityDetails, formatActivityType } from "@/client/src/lib/activityFormatters.ts";
import { formatDateTime } from "@/client/src/lib/formatDate.ts";
import { activityListQuery } from "@/client/src/lib/queries.ts";

type SortField = "createdAt" | "type";

const ACTIVITY_SORT_OPTIONS: SortOption<SortField>[] = [
  ...CREATED_SORTS,
  { field: "type", direction: "asc", label: "Type (A-Z)" },
  { field: "type", direction: "desc", label: "Type (Z-A)" },
];

export default function ActivitiesPage() {
  usePageTitle("Activities");
  const openTarget = useOpenActivityTarget();
  const { search, orderBy, orderDir, searchBarProps } = useListParams(["createdAt", "type"], {
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const activities = useListPageQuery(activityListQuery({ search, orderBy, orderDir }));

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Stack spacing={4}>
          <PageHeader title="Activity" subtitle="View your activity history and track actions" />
          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search activity logs…"
              sortOptions={ACTIVITY_SORT_OPTIONS}
            />

            <ListPageResults
              list={activities}
              what="Activity logs"
              search={search}
              loadMoreLabel="Load More Activities"
              // An empty page's state sits a unit lower than its table, as its margin placed it
              emptySx={{ pt: 1 }}
              empty={
                <BlankState
                  icon={HistoryIcon}
                  title="No activity logs found"
                  description="Your activity history will appear here as you interact with the application."
                />
              }
            >
              <TableFrame>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Action</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activities.items.map((activity) => {
                      const isNavigable = isNavigableTarget(activity.targetTable);
                      return (
                        <TableRow
                          key={activity.id}
                          {...(isNavigable &&
                            clickableProps(() => openTarget(activity.targetTable, activity.targetId)))}
                          sx={[{ "&:hover": { bgcolor: "action.hover" } }, isNavigable && CLICKABLE_SX]}
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
                              {formatDateTime(activity.createdAt)}
                            </Typography>
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
