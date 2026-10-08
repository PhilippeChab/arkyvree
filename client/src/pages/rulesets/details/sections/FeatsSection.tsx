import { Box, Skeleton, Stack, Table, TableBody, TableCell, TableRow, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useCallback } from "react";

import {
  BlankState,
  CLICKABLE_ROW_SX,
  clickableProps,
  CountChip,
  CreateDialog,
  EmptyValue,
  ExpandArrow,
  ListPageResults,
  LoadError,
  LoadMoreButton,
  SearchBar,
  SectionContent,
  TableColumnsHead,
  TableFrame,
  TableSkeleton,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { FeatsIcon } from "@/client/src/components/icons/index.ts";
import { useListPageQuery, useSearchParam, useSearchText, useToggleSet } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { EMPTY_FEAT, type FeatFormData, FeatFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  AptitudeAutocomplete,
  AptitudeChipsCell,
  DescriptionCell,
  RulesetSectionTable,
  SectionActions,
  TABLE_CONTAINER_LOADING_SX,
  TABLE_CONTAINER_SX,
  TABLE_SX,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { featFamilyQuery, featsGroupedQuery, featsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useAptitudeFilter, useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

type Feat = FeatsPaginated["items"][number];

type FeatsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["$get"], 200>;
type GroupedFeatRow = GroupedPaginated["items"][number];

type GroupedPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["grouped"]["$get"], 200>;
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
  /** Warms a feat's page, as it's pointed at. */
  onRowMouseEnter: (feat: Pick<Feat, "id">) => void;
  onToggleFamily: (family: string) => void;
  row: GroupedFeatRow;
  rulesetId: string;
}

const FEATS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];

const GROUPED_COLUMNS = [
  { key: "name", label: "Name", width: "50%" },
  { key: "variants", label: "Variants", width: "50%" },
];

/** What the tab says while it lists no feat, grouped or not */
const NO_FEATS = { title: "No feats", description: "No feats available for this ruleset." };

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
  onRowMouseEnter,
}: GroupedRowProps) {
  const variantQuery = useInfiniteQuery({ ...featFamilyQuery(rulesetId, family, childOnly), enabled: isExpanded });

  const variants = pageItems(variantQuery.data);

  if (family !== null) {
    return (
      <>
        <TableRow
          {...toggleProps(isExpanded, () => onToggleFamily(family), "row")}
          sx={[CLICKABLE_ROW_SX, fadeInUpSx(animationIndex, animationOffset)]}
        >
          <TableCell>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <ExpandArrow open={isExpanded} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {row.displayName}
              </Typography>
            </Stack>
          </TableCell>
          <TableCell>
            <CountChip label={formatCount(row.variantCount, "variant")} />
          </TableCell>
        </TableRow>
        {isExpanded && variantQuery.isLoading && (
          <TableRow>
            <TableCell colSpan={2} sx={{ pl: 6 }}>
              <Skeleton variant="text" width="60%" />
            </TableCell>
          </TableRow>
        )}
        {isExpanded && !!variantQuery.error && variants.length === 0 && (
          <TableRow>
            <TableCell colSpan={2} sx={{ pl: 6 }}>
              <LoadError what="Variants" error={variantQuery.error} />
            </TableCell>
          </TableRow>
        )}
        {isExpanded &&
          variants.map((feat, i) => {
            const previousItemCount = itemsBeforeLastPage(variantQuery.data);
            const isNew = i >= previousItemCount;
            return (
              <TableRow
                key={feat.id}
                {...clickableProps(() => onRowClick(feat))}
                onMouseEnter={() => onRowMouseEnter(feat)}
                onFocus={() => onRowMouseEnter(feat)}
                sx={[CLICKABLE_ROW_SX, isNew && fadeInUpSx(i - previousItemCount)]}
              >
                <TableCell sx={{ pl: 6 }}>
                  <Typography variant="body2">{feat.name}</Typography>
                </TableCell>
                <TableCell>
                  <DescriptionCell text={feat.description} />
                </TableCell>
              </TableRow>
            );
          })}
        {isExpanded && variantQuery.hasNextPage && (
          <TableRow>
            <TableCell colSpan={2} sx={{ pl: 6 }}>
              <LoadMoreButton
                hasNextPage
                isFetchingNextPage={variantQuery.isFetchingNextPage}
                onClick={() => variantQuery.fetchNextPage()}
              />
            </TableCell>
          </TableRow>
        )}
      </>
    );
  }

  // Non-family row — navigate to the representative feat
  return (
    <TableRow
      {...clickableProps(() => onRowClick({ id: row.representativeId }))}
      onMouseEnter={() => onRowMouseEnter({ id: row.representativeId })}
      onFocus={() => onRowMouseEnter({ id: row.representativeId })}
      sx={[CLICKABLE_ROW_SX, fadeInUpSx(animationIndex, animationOffset)]}
    >
      <TableCell>
        <Typography variant="body2">{row.displayName}</Typography>
      </TableCell>
      <TableCell>
        <EmptyValue />
      </TableCell>
    </TableRow>
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

  const { createForm, createDialogProps, handleCreate } = useRulesetSection<Feat, FeatFormData>({
    createDefaults: EMPTY_FEAT,
    rulesetId: ruleset.id,
    sectionName: "feats",
    label: "Feat",
    createFn: async (data) =>
      parseResponse(rpc.api.rulesets[":id"].feats.$post({ param: { id: ruleset.id }, json: data })),
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

  const handleRowMouseEnter = useCallback(
    (feat: Pick<Feat, "id">) => {
      void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "feats", feat.id));
    },
    [queryClient, ruleset.id],
  );

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
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search feats…"
          filters={
            <Box sx={{ width: { xs: "100%", sm: 200 } }}>
              <AptitudeAutocomplete
                rulesetId={ruleset.id}
                value={aptitude}
                loadError={aptitudeError}
                onChange={setAptitude}
                size="small"
                scope="feats"
              />
            </Box>
          }
          actions={
            <SectionActions
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
            </SectionActions>
          }
        />
        {grouped ? (
          <ListPageResults
            variant="section"
            list={groupedList}
            search={searchQuery}
            what="Feats"
            skeleton={<TableSkeleton columns={GROUPED_COLUMNS} sx={TABLE_CONTAINER_LOADING_SX} tableSx={TABLE_SX} />}
            empty={<BlankState icon={FeatsIcon} {...NO_FEATS} />}
          >
            <TableFrame sx={TABLE_CONTAINER_SX}>
              <Table sx={TABLE_SX}>
                <TableColumnsHead columns={GROUPED_COLUMNS} />
                <TableBody>
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
                        onRowMouseEnter={handleRowMouseEnter}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </TableFrame>
          </ListPageResults>
        ) : (
          <Stack spacing={2}>
            <RulesetSectionTable
              what="Feats"
              error={flatQuery.error}
              data={feats}
              search={searchQuery}
              isLoading={flatQuery.isLoading}
              columns={FEATS_COLUMNS}
              onRowClick={handleRowClick}
              onRowMouseEnter={handleRowMouseEnter}
              renderCell={renderCell}
              emptyIcon={FeatsIcon}
              emptyTitle={NO_FEATS.title}
              emptyDescription={NO_FEATS.description}
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
        <FeatFormFields form={createForm} rulesetId={ruleset.id} aptitudesRequired />
      </CreateDialog>
    </SectionContent>
  );
}
