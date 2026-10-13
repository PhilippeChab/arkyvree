import { Container, Stack, Typography } from "@mui/material";

import {
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  CREATED_SORTS,
  DataCell,
  DataRow,
  DataTable,
  ListPageResults,
  PageHeader,
  PageTransition,
  SearchBar,
  type SortOption,
  type TableColumn,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { HistoryIcon } from "@/client/src/components/icons/index.ts";
import { ActivityDetails } from "@/client/src/components/notifications/index.ts";
import { useListPageQuery, useListParams, useOpenActivityTarget, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatActivityType } from "@/client/src/lib/activityFormatters.ts";
import { formatDateTime } from "@/client/src/lib/formatDate.ts";
import { isNavigableTarget } from "@/shared/activity.ts";

import { type ActivityListFilters, activityListQuery } from "./activityQueries.ts";

type SortField = ActivityListFilters["orderBy"];

/** An activity's columns: on a phone, what happened leads, its date under it */
const ACTIVITY_COLUMNS: TableColumn[] = [
  { key: "action", label: "Action" },
  { key: "date", label: "Date" },
];

const ACTIVITY_SORT_OPTIONS: SortOption<SortField>[] = [
  ...CREATED_SORTS,
  { field: "type", direction: "asc", label: "Type (A-Z)" },
  { field: "type", direction: "desc", label: "Type (Z-A)" },
];

export default function ActivitiesPage() {
  usePageTitle("Activity");
  const openTarget = useOpenActivityTarget();
  const { search, orderBy, orderDir, searchBarProps } = useListParams(["createdAt", "type"], {
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const activities = useListPageQuery(activityListQuery({ search, orderBy, orderDir }));

  return (
    <PageTransition>
      <Container>
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
              // An empty page's state sits a unit lower than its table would
              emptySx={{ pt: 1 }}
              empty={
                <BlankState
                  icon={HistoryIcon}
                  title="No activity logs found"
                  description="Your activity history will appear here as you interact with the application."
                />
              }
            >
              <DataTable framed columns={ACTIVITY_COLUMNS}>
                {activities.items.map((activity) => {
                  const isNavigable = isNavigableTarget(activity.targetTable);
                  return (
                    <DataRow
                      key={activity.id}
                      {...(isNavigable && clickableProps(() => openTarget(activity.targetTable, activity.targetId)))}
                      sx={[isNavigable && CLICKABLE_ROW_SX]}
                    >
                      <DataCell slot="primary">
                        <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                          <ValueChip color="default" label={formatActivityType(activity.type, activity.data)} />
                          <ActivityDetails type={activity.type} data={activity.data} />
                        </Stack>
                      </DataCell>
                      <DataCell slot="inline">
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {formatDateTime(activity.createdAt)}
                        </Typography>
                      </DataCell>
                    </DataRow>
                  );
                })}
              </DataTable>
            </ListPageResults>
          </Stack>
        </Stack>
      </Container>
    </PageTransition>
  );
}
