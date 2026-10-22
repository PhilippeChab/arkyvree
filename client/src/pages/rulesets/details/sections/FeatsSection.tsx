import { Box, Skeleton, Stack, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  CountChip,
  CreateDialog,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ExpandArrow,
  ListPageResults,
  LoadError,
  LoadMoreButton,
  SectionContent,
  type TableColumn,
  TableSkeleton,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { FeatsIcon } from "@/client/src/components/icons/index.ts";
import { useListPageQuery, useSearchParam, useSearchText, useToggleSet } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type ColumnContext,
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  AptitudeAutocomplete,
  AptitudeChipsCell,
  DescriptionCell,
  RulesetSectionTable,
  SectionSearchBar,
  TABLE_CONTAINER_LOADING_SX,
  TABLE_CONTAINER_SX,
  TABLE_MIN_WIDTH,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { featFamilyQuery, featsGroupedQuery, featsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useAptitudeFilter,
  useEntityColumns,
  useEntityFields,
  useOpenEntity,
  useRowPrefetch,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

interface GroupedRowProps {
  /** Its place in the list, which staggers its entry (`fadeInUpSx`), from the page that came in (`animationOffset`). */
  animationIndex: number;
  animationOffset: number;
  childOnly: boolean;
  /** Set on a row that groups several variants. */
  family: string | null;
  isExpanded: boolean;
  /** Opens a feat's page: the row's own, or one of its variants'. */
  onRowClick: (feat: Pick<Feat, "id">) => void;
  /** Warms a feat's page, as it's about to be opened (`useRowPrefetch`). */
  onRowPrefetch: (feat: Pick<Feat, "id">) => void;
  onToggleFamily: (family: string) => void;
  row: GroupedFeatRow;
  rulesetId: string;
}

type Feat = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["$get"], 200>["items"][number];

type GroupedFeatRow = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["feats"]["grouped"]["$get"],
  200
>["items"][number];

const FEATS_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%", slot: "inline" },
  { key: "description", label: "Description", width: "60%", slot: "block" },
];

const GROUPED_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "50%" },
  { key: "variants", label: "Variants", width: "50%" },
];

/** A new feat's form, which needs a pool. */
const NEW_FEAT: ColumnContext = { newEntity: true };

/** What the tab says while it lists no feat, grouped or not */
const NO_FEATS = { title: "No feats", description: "No feats available for this ruleset." };

/** A family's variants' indent under it, from `sm` up (a phone's is its rows' `indented`) */
const VARIANT_INDENT_SX = { pl: 6 };

function GroupedRow({
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
}: GroupedRowProps) {
  const variantQuery = useInfiniteQuery({ ...featFamilyQuery(rulesetId, family, childOnly), enabled: isExpanded });
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
          variants.map((feat, i) => (
            <DataRow
              key={feat.id}
              indented
              {...clickableProps(() => onRowClick(feat))}
              {...prefetchProps(feat)}
              // The page that came in staggers in, as a paged table's rows do
              sx={[CLICKABLE_ROW_SX, fadeInUpSx(i, itemsBeforeLastPage(variantQuery.data))]}
            >
              <DataCell slot="primary" sx={VARIANT_INDENT_SX}>
                <Typography variant="body2">{feat.name}</Typography>
              </DataCell>
              <DataCell slot="block">
                <DescriptionCell text={feat.description} />
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

  // Non-family row — navigate to the representative feat
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

export function FeatsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const { aptitude, aptitudeError, aptitudeId, setAptitude } = useAptitudeFilter(ruleset.id);
  const { value: groupedParam, setValue: setGroupedParam } = useSearchParam("grouped", "true");
  const grouped = oneOf(groupedParam, ["true", "false"], "true") === "true";
  const { keys: expandedFamilies, toggle: toggleFamily, clear: collapseFamilies } = useToggleSet();

  const { fields: featFields } = useEntityFields(ruleset.id, "feats");
  const { columns: featColumns } = useEntityColumns(ruleset.id, "feats");
  const { createForm, createDialogProps, handleCreate } = useRulesetSection<Feat, EntityFormData>({
    createDefaults: withEntityFields(toEntityForm<EntityFormData>(featColumns), featFields),
    rulesetId: ruleset.id,
    sectionName: "feats",
    label: "Feat",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats.$post({
          param: { id: ruleset.id },
          json: toEntityBody<EntityFormData, EntityFormData>(featColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(buildCustomizationPath("feats", created.id)),
  });

  // Flat query (used when grouped is off)
  const flatQuery = useInfiniteQuery({
    ...featsQuery(ruleset.id, { search: searchQuery, childOnly, aptitudeId }),
    placeholderData: keepPreviousData,
    enabled: !grouped,
  });

  // Grouped list (used when grouped is on)
  const groupedList = useListPageQuery({
    ...featsGroupedQuery(ruleset.id, { search: searchQuery, childOnly, aptitudeId }),
    enabled: grouped,
  });

  const feats = pageItems(flatQuery.data);

  const handleRowClick = (feat: Pick<Feat, "id">) => {
    openEntity(buildCustomizationPath("feats", feat.id));
  };

  const handleRowPrefetch = (feat: Pick<Feat, "id">) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "feats", feat.id));
  };

  const handleGroupedToggle = () => {
    setGroupedParam(grouped ? "false" : "true");
    collapseFamilies();
  };

  const renderCell = (feat: Feat, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return feat.name;
      case "aptitudes":
        return <AptitudeChipsCell links={feat.featsAptitudesInRules} />;
      case "description":
        return <DescriptionCell text={feat.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search feats…"
          filters={
            <Box sx={{ width: { xs: "100%", md: 200 } }}>
              <AptitudeAutocomplete
                rulesetId={ruleset.id}
                value={aptitude}
                loadError={aptitudeError}
                onChange={setAptitude}
                scope="feats"
              />
            </Box>
          }
          filtered={!!aptitudeId}
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Feat"
          onAdd={handleCreate}
        >
          <ToggleButton
            value="grouped"
            selected={grouped}
            onChange={handleGroupedToggle}
            sx={{ textTransform: "none" }}
          >
            Group Families
          </ToggleButton>
        </SectionSearchBar>
        {grouped ? (
          <ListPageResults
            variant="section"
            list={groupedList}
            search={searchQuery}
            what="Feats"
            skeleton={
              <TableSkeleton columns={GROUPED_COLUMNS} sx={TABLE_CONTAINER_LOADING_SX} minWidth={TABLE_MIN_WIDTH} />
            }
            empty={<BlankState icon={FeatsIcon} {...NO_FEATS} />}
          >
            <DataTable framed columns={GROUPED_COLUMNS} containerSx={TABLE_CONTAINER_SX} minWidth={TABLE_MIN_WIDTH}>
              {groupedList.items.map((row, index) => {
                const family = row.variantCount > 1 ? row.family : null;
                return (
                  <GroupedRow
                    key={row.family ?? row.representativeId}
                    row={row}
                    rulesetId={ruleset.id}
                    childOnly={childOnly}
                    family={family}
                    isExpanded={family !== null && expandedFamilies.has(family)}
                    animationIndex={index}
                    animationOffset={groupedList.offset}
                    onToggleFamily={toggleFamily}
                    onRowClick={handleRowClick}
                    onRowPrefetch={handleRowPrefetch}
                  />
                );
              })}
            </DataTable>
          </ListPageResults>
        ) : (
          <Stack spacing={2}>
            <RulesetSectionTable
              what="Feats"
              error={flatQuery.error}
              data={feats}
              animationOffset={itemsBeforeLastPage(flatQuery.data)}
              search={searchQuery}
              isLoading={flatQuery.isLoading}
              columns={FEATS_COLUMNS}
              onRowClick={handleRowClick}
              onRowPrefetch={handleRowPrefetch}
              renderCell={renderCell}
              empty={<BlankState icon={FeatsIcon} title={NO_FEATS.title} description={NO_FEATS.description} />}
            />
            <LoadMoreButton
              hasNextPage={flatQuery.hasNextPage}
              isFetchingNextPage={flatQuery.isFetchingNextPage}
              onClick={() => flatQuery.fetchNextPage()}
            />
          </Stack>
        )}
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Feat">
        <RulesetEntityFormFields form={createForm} entityType="feats" rulesetId={ruleset.id} context={NEW_FEAT} />
      </CreateDialog>
    </SectionContent>
  );
}
