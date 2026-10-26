import { Skeleton, Stack, Typography } from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  CountChip,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ExpandArrow,
  ListPageResults,
  LoadError,
  LoadMoreButton,
  type TableColumn,
  TableSkeleton,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { type SvgIconComponent } from "@/client/src/components/icons/index.ts";
import { useListPageQuery, useToggleSet } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import {
  DescriptionCell,
  TABLE_CONTAINER_LOADING_SX,
  TABLE_CONTAINER_SX,
  TABLE_MIN_WIDTH,
} from "@/client/src/pages/rulesets/components/index.ts";
import {
  entityFamilyQuery,
  type EntityGroup,
  entityGroupsQuery,
} from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useRowPrefetch } from "@/client/src/pages/rulesets/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

interface EntityGroupsTableProps {
  childOnly: boolean;
  /** What it says while it lists no group */
  empty: { description: string; icon: SvgIconComponent; title: string };
  /** Its kind: its type (`feats`), the pools it narrows by, and the field its families are of */
  kind: Pick<EntityKindDescription, "families" | "pools" | "type">;
  /** Opens an entity's page: a row's own, or one of its variants'. */
  onRowClick: (entity: { id: string }) => void;
  /** Warms an entity's page, as it's about to be opened (`useRowPrefetch`). */
  onRowPrefetch: (entity: { id: string }) => void;
  /** The pool it's narrowed by, its id, where its kind narrows by one */
  pool?: string;
  rulesetId: string;
  search: string;
  /** What its rows are, as a failure names them ("Feats") */
  what: string;
}

interface GroupRowProps {
  /** Its place in the list, which staggers its entry (`fadeInUpSx`), from the page that came in (`animationOffset`). */
  animationIndex: number;
  animationOffset: number;
  childOnly: boolean;
  entityType: string;
  /** Set on a row that groups several variants. */
  family: string | null;
  /** The field its kind's families are of (a feat's), which its variants' list filters by */
  familyField: string;
  isExpanded: boolean;
  onRowClick: (entity: { id: string }) => void;
  onRowPrefetch: (entity: { id: string }) => void;
  onToggleFamily: (family: string) => void;
  row: EntityGroup;
  rulesetId: string;
}

const GROUPED_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "50%" },
  { key: "variants", label: "Variants", width: "50%" },
];

/** A family's variants' indent under it, from `sm` up (a phone's is its rows' `indented`) */
const VARIANT_INDENT_SX = { pl: 6 };

function GroupRow({
  entityType,
  familyField,
  row,
  rulesetId,
  childOnly,
  family,
  isExpanded,
  animationIndex,
  animationOffset,
  onToggleFamily,
  onRowClick,
  onRowPrefetch,
}: GroupRowProps) {
  const variantQuery = useInfiniteQuery({
    ...entityFamilyQuery(rulesetId, { field: familyField, type: entityType }, family, childOnly),
    enabled: isExpanded,
  });
  const prefetchProps = useRowPrefetch(onRowPrefetch);

  const variants = pageItems(variantQuery.data);

  if (family !== null) {
    return (
      <>
        <DataRow
          {...toggleProps(isExpanded, () => onToggleFamily(family), "row")}
          sx={[CLICKABLE_ROW_SX, fadeInUpSx(animationIndex, animationOffset)]}
        >
          <DataCell slot="primary">
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <ExpandArrow open={isExpanded} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {row.displayName}
              </Typography>
            </Stack>
          </DataCell>
          <DataCell slot="trailing">
            <CountChip label={formatCount(row.variantCount, "variant")} />
          </DataCell>
        </DataRow>
        {isExpanded && variantQuery.isLoading && (
          <DataRow indented>
            <DataCell colSpan={2} slot="block" sx={VARIANT_INDENT_SX}>
              <Skeleton variant="text" width="60%" />
            </DataCell>
          </DataRow>
        )}
        {isExpanded && !!variantQuery.error && variants.length === 0 && (
          <DataRow indented>
            <DataCell colSpan={2} slot="block" sx={VARIANT_INDENT_SX}>
              <LoadError what="Variants" error={variantQuery.error} />
            </DataCell>
          </DataRow>
        )}
        {isExpanded &&
          variants.map((entity, i) => (
            <DataRow
              key={entity.id}
              indented
              {...clickableProps(() => onRowClick(entity))}
              {...prefetchProps(entity)}
              // The page that came in staggers in, as a paged table's rows do
              sx={[CLICKABLE_ROW_SX, fadeInUpSx(i, itemsBeforeLastPage(variantQuery.data))]}
            >
              <DataCell slot="primary" sx={VARIANT_INDENT_SX}>
                <Typography variant="body2">{entity.name}</Typography>
              </DataCell>
              <DataCell slot="block">
                <DescriptionCell text={entity.description} />
              </DataCell>
            </DataRow>
          ))}
        {isExpanded && variantQuery.hasNextPage && (
          <DataRow indented>
            <DataCell colSpan={2} slot="block" sx={VARIANT_INDENT_SX}>
              <LoadMoreButton
                nested
                hasNextPage
                isFetchingNextPage={variantQuery.isFetchingNextPage}
                onClick={() => variantQuery.fetchNextPage()}
              />
            </DataCell>
          </DataRow>
        )}
      </>
    );
  }

  // A row of one entity opens it
  return (
    <DataRow
      {...clickableProps(() => onRowClick({ id: row.representativeId }))}
      {...prefetchProps({ id: row.representativeId })}
      sx={[CLICKABLE_ROW_SX, fadeInUpSx(animationIndex, animationOffset)]}
    >
      <DataCell slot="primary">
        <Typography variant="body2">{row.displayName}</Typography>
      </DataCell>
      <DataCell slot="hidden">
        <EmptyValue />
      </DataCell>
    </DataRow>
  );
}

/**
 * A kind's list with its variants grouped under their family (a feat's), narrowed by its search, its pool and Local
 * Changes: a family's row expands into its variants, a row of one entity opens it.
 */
export function EntityGroupsTable({
  childOnly,
  empty,
  kind,
  onRowClick,
  onRowPrefetch,
  pool,
  rulesetId,
  search,
  what,
}: EntityGroupsTableProps) {
  const groups = useListPageQuery(entityGroupsQuery(rulesetId, kind, { search, childOnly, pool }));
  const { keys: expandedFamilies, toggle: toggleFamily } = useToggleSet();
  return (
    <ListPageResults
      variant="section"
      list={groups}
      search={search}
      what={what}
      skeleton={<TableSkeleton columns={GROUPED_COLUMNS} sx={TABLE_CONTAINER_LOADING_SX} minWidth={TABLE_MIN_WIDTH} />}
      empty={<BlankState {...empty} />}
    >
      <DataTable framed columns={GROUPED_COLUMNS} containerSx={TABLE_CONTAINER_SX} minWidth={TABLE_MIN_WIDTH}>
        {groups.items.map((row, index) => {
          const family = row.variantCount > 1 ? row.group : null;
          return (
            <GroupRow
              key={row.group ?? row.representativeId}
              row={row}
              rulesetId={rulesetId}
              entityType={kind.type}
              childOnly={childOnly}
              family={family}
              familyField={kind.families?.field ?? ""}
              isExpanded={family !== null && expandedFamilies.has(family)}
              animationIndex={index}
              animationOffset={groups.offset}
              onToggleFamily={toggleFamily}
              onRowClick={onRowClick}
              onRowPrefetch={onRowPrefetch}
            />
          );
        })}
      </DataTable>
    </ListPageResults>
  );
}
