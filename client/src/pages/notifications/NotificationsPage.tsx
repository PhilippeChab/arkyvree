import { Container, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

import {
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  CREATED_SORTS,
  type FilterOption,
  ListPageResults,
  PageActionButton,
  PageHeader,
  PageTransition,
  SearchBar,
  TableFrame,
} from "@/client/src/components/common/index.ts";
import { CheckIcon, NotificationsIcon } from "@/client/src/components/icons/index.ts";
import { InviteActionButtons } from "@/client/src/components/invites/index.ts";
import { NotificationMessage, UNREAD_NOTIFICATION_SX } from "@/client/src/components/notifications/index.ts";
import { useListPageQuery, useListParams, useNotificationActions, usePageTitle } from "@/client/src/hooks/index.ts";
import { formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";

import { notificationListQuery } from "./notificationQueries.ts";

const FILTER_OPTIONS: FilterOption<"unread">[] = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
];

export default function NotificationsPage() {
  usePageTitle("Notifications");
  const actions = useNotificationActions();
  const { searchParams, updateSearchParams, search, orderDir, searchBarProps } = useListParams(["createdAt"], {
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const unreadOnly = oneOf(searchParams.get("filter"), ["unread"]) === "unread";

  const notifications = useListPageQuery(notificationListQuery({ search, orderDir, unreadOnly }));

  return (
    <PageTransition>
      <Container>
        <Stack spacing={4}>
          <PageHeader
            title="Notifications"
            subtitle="Updates from your campaigns and rulesets"
            action={
              <PageActionButton
                icon={<CheckIcon />}
                label="Mark All as Read"
                onClick={() => actions.markAllRead.mutate()}
                pending={actions.markAllRead.isPending}
              />
            }
          />
          <Stack spacing={3}>
            <SearchBar
              {...searchBarProps}
              searchPlaceholder="Search notifications…"
              filterOptions={FILTER_OPTIONS}
              filterValue={unreadOnly ? "unread" : undefined}
              onFilterChange={(value) => updateSearchParams({ filter: value })}
              sortOptions={CREATED_SORTS}
              sortField="createdAt"
            />

            <ListPageResults
              list={notifications}
              what="Notifications"
              search={search}
              // An empty page's state sits a unit lower than its table would
              emptySx={{ pt: 1 }}
              empty={
                <BlankState
                  icon={NotificationsIcon}
                  title={unreadOnly ? "No unread notifications" : "No notifications yet"}
                  description="Notifications from your campaigns and collaborators will appear here."
                />
              }
            >
              <TableFrame>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Notification</TableCell>
                      <TableCell>When</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {notifications.items.map((notification) => {
                      const isUnread = !notification.readAt;
                      const openable = actions.isOpenable(notification);

                      return (
                        <TableRow
                          key={notification.id}
                          {...(openable && clickableProps(() => actions.open(notification)))}
                          sx={[openable && CLICKABLE_ROW_SX, isUnread && UNREAD_NOTIFICATION_SX]}
                        >
                          <TableCell>
                            <NotificationMessage notification={notification} unread={isUnread} />
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
                                pending={actions.answering(notification)}
                              />
                            )}
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
