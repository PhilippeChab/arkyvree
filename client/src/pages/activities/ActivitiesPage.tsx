import { Container, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

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
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { HistoryIcon } from "@/client/src/components/icons/index.ts";
import { ActivityDetails } from "@/client/src/components/notifications/index.ts";
import {
  isNavigableTarget,
  useListPageQuery,
  useListParams,
  useOpenActivityTarget,
  usePageTitle,
} from "@/client/src/hooks/index.ts";
import { formatActivityType } from "@/client/src/lib/activityFormatters.ts";
import { formatDateTime } from "@/client/src/lib/formatDate.ts";

import { activityListQuery } from "./activityQueries.ts";

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
      <Container maxWidth="lg">
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
                            <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                              <ValueChip color="default" label={formatActivityType(activity.type, activity.data)} />
                              <ActivityDetails type={activity.type} data={activity.data} />
                            </Stack>
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
