import {
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useCallback, useState } from "react";

import {
  BlankState,
  CLICKABLE_SX,
  clickableProps,
  CreateDialog,
  DiceSpinner,
  ExpandArrow,
  LoadError,
  LoadMoreButton,
  NoMatchesState,
  SearchBar,
  SectionContent,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { type Aptitude, AptitudeAutocomplete } from "@/client/src/components/customization/index.ts";
import { FeatsIcon } from "@/client/src/components/icons/index.ts";
import { useSearchParam, useSearchText, useToggleSet } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { EMPTY_FEAT, type FeatFormData, FeatFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
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
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

type Feat = FeatsPaginated["items"][number];

type FeatsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["$get"], 200>;
type GroupedFeatRow = GroupedPaginated["items"][number];

type GroupedPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["grouped"]["$get"], 200>;
interface GroupedRowProps {
  childOnly: boolean;
  /** Set on a row that groups several variants. */
  family: string | null;
  isExpanded: boolean;
  onRowClick: (feat: Pick<Feat, "id">) => void;
  onRowMouseEnter: (feat: Pick<Feat, "id">) => void;
  onToggleFamily: (family: string) => void;
  onVariantClick: (feat: Feat) => void;
  onVariantMouseEnter: (feat: Feat) => void;
  row: GroupedFeatRow;
  rowIndex: number;
  rulesetId: string;
}

const FEATS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%" },
  { key: "prerequisites", label: "Prerequisites", width: "20%" },
  { key: "description", label: "Description", width: "40%" },
];

const GROUPED_COLUMNS = [
  { key: "name", label: "Name", width: "50%" },
  { key: "variants", label: "Variants", width: "50%" },
];

function GroupedRow({
  row,
  rulesetId,
  childOnly,
  family,
  isExpanded,
  rowIndex,
  onToggleFamily,
  onVariantClick,
  onVariantMouseEnter,
  onRowClick,
  onRowMouseEnter,
}: GroupedRowProps) {
  const variantQuery = useInfiniteQuery({ ...featFamilyQuery(rulesetId, family, childOnly), enabled: isExpanded });

  const variants = pageItems(variantQuery.data);

  if (family !== null) {
    return (
      <>
        <TableRow
          hover
          {...toggleProps(isExpanded, () => onToggleFamily(family), "row")}
          sx={{ ...CLICKABLE_SX, ...fadeInUpSx(rowIndex) }}
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
            <Chip label={formatCount(row.variantCount, "variant")} size="small" variant="outlined" />
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
                hover
                {...clickableProps(() => onVariantClick(feat))}
                onMouseEnter={() => onVariantMouseEnter(feat)}
                onFocus={() => onVariantMouseEnter(feat)}
                sx={[CLICKABLE_SX, isNew && fadeInUpSx(i - previousItemCount)]}
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
              <Button
                size="small"
                onClick={() => variantQuery.fetchNextPage()}
                disabled={variantQuery.isFetchingNextPage}
              >
                <DiceSpinner size="small" loading={variantQuery.isFetchingNextPage}>
                  Load More
                </DiceSpinner>
              </Button>
            </TableCell>
          </TableRow>
        )}
      </>
    );
  }

  // Non-family row — navigate to the representative feat
  return (
    <TableRow
      hover
      {...clickableProps(() => onRowClick({ id: row.representativeId }))}
      onMouseEnter={() => onRowMouseEnter({ id: row.representativeId })}
      onFocus={() => onRowMouseEnter({ id: row.representativeId })}
      sx={{ ...CLICKABLE_SX, ...fadeInUpSx(rowIndex) }}
    >
      <TableCell>
        <Typography variant="body2">{row.displayName}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          —
        </Typography>
      </TableCell>
    </TableRow>
  );
}

export function FeatsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const [selectedAptitude, setSelectedAptitude] = useState<Aptitude | null>(null);
  const { value: groupedParam, setValue: setGroupedParam } = useSearchParam("grouped", "true");
  const grouped = groupedParam === "true";
  const { keys: expandedFamilies, toggle: toggleFamily, clear: collapseFamilies } = useToggleSet();

  const { setCreateDialogOpen, createForm, createDialogProps } = useRulesetSection<Feat, FeatFormData>({
    createDefaults: EMPTY_FEAT,
    rulesetId: ruleset.id,
    sectionName: "feats",
    label: "Feat",
    createFn: async (data) => {
      if (!data.aptitudeIds?.length) throw new Error("At least one aptitude must be selected");

      return parseResponse(rpc.api.rulesets[":id"].feats.$post({ param: { id: ruleset.id }, json: data }));
    },
    onCreateSuccess: (created) => openEntity(`feats/${created.id}/customization`),
  });

  // Flat query (used when grouped is off)
  const flatQuery = useInfiniteQuery({
    ...featsQuery(ruleset.id, { search: searchQuery, childOnly, aptitudeId: selectedAptitude?.id }),
    placeholderData: keepPreviousData,
    enabled: !grouped,
  });

  // Grouped query (used when grouped is on)
  const groupedQuery = useInfiniteQuery({
    ...featsGroupedQuery(ruleset.id, { search: searchQuery, childOnly, aptitudeId: selectedAptitude?.id }),
    placeholderData: keepPreviousData,
    enabled: grouped,
  });

  const feats = pageItems(flatQuery.data);
  const groupedFeats = pageItems(groupedQuery.data);

  const handleCreate = () => {
    createForm.reset();
    setCreateDialogOpen(true);
  };

  const handleRowClick = (feat: Pick<Feat, "id">) => {
    openEntity(`feats/${feat.id}/customization`);
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

  const isLoading = grouped ? groupedQuery.isLoading : flatQuery.isLoading;
  const hasNextPage = grouped ? groupedQuery.hasNextPage : flatQuery.hasNextPage;
  const isFetchingNextPage = grouped ? groupedQuery.isFetchingNextPage : flatQuery.isFetchingNextPage;
  const fetchNextPage = grouped ? groupedQuery.fetchNextPage : flatQuery.fetchNextPage;

  const renderGroupedTable = () => {
    if (groupedQuery.isLoading) {
      return (
        <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_LOADING_SX}>
          <Table sx={TABLE_SX}>
            <TableHead>
              <TableRow>
                {GROUPED_COLUMNS.map((col) => (
                  <TableCell key={col.key} sx={{ width: col.width, fontWeight: 600 }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {GROUPED_COLUMNS.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    if (groupedQuery.error && groupedFeats.length === 0) return <LoadError what="Feats" error={groupedQuery.error} />;

    if (groupedFeats.length === 0) {
      return searchQuery ? (
        <NoMatchesState search={searchQuery} />
      ) : (
        <BlankState icon={FeatsIcon} title="No feats" description="No feats available for this ruleset." />
      );
    }

    let rowIndex = 0;

    return (
      <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_SX}>
        <Table sx={TABLE_SX}>
          <TableHead>
            <TableRow>
              {GROUPED_COLUMNS.map((col) => (
                <TableCell key={col.key} sx={{ width: col.width, fontWeight: 600 }}>
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedFeats.map((row) => {
              const family = row.variantCount > 1 ? row.family : null;
              const isExpanded = family !== null && expandedFamilies.has(family);
              const currentIndex = rowIndex++;

              return (
                <GroupedRow
                  key={row.family ?? row.representativeId}
                  row={row}
                  rulesetId={ruleset.id}
                  childOnly={childOnly}
                  family={family}
                  isExpanded={isExpanded}
                  rowIndex={currentIndex}
                  onToggleFamily={toggleFamily}
                  onVariantClick={handleRowClick}
                  onVariantMouseEnter={handleRowMouseEnter}
                  onRowClick={handleRowClick}
                  onRowMouseEnter={handleRowMouseEnter}
                />
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
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
                value={selectedAptitude}
                onChange={setSelectedAptitude}
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
        <Stack spacing={2}>
          {grouped ? (
            renderGroupedTable()
          ) : (
            <RulesetSectionTable
              what="Feats"
              error={flatQuery.error}
              data={feats}
              search={searchQuery}
              isLoading={isLoading}
              columns={FEATS_COLUMNS}
              onRowClick={handleRowClick}
              onRowMouseEnter={handleRowMouseEnter}
              renderCell={renderCell}
              emptyIcon={FeatsIcon}
              emptyTitle="No feats"
              emptyDescription="No feats available for this ruleset."
            />
          )}
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Feat">
        <FeatFormFields form={createForm} rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
