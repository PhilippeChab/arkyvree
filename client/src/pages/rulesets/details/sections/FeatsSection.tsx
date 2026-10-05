import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon, Spoke as FeatsIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, skipToken, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useState } from "react";

import {
  BlankState,
  CLICKABLE_SX,
  clickableProps,
  CreateDialog,
  DiceSpinner,
  LoadMoreButton,
  NoMatchesState,
  SearchBar,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { type Aptitude, AptitudeAutocomplete } from "@/client/src/components/customization/index.ts";
import { useSearchParam, useToggleSet } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { type FeatFormData, FeatFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  AptitudeChipsCell,
  DescriptionCell,
  RulesetSectionTable,
  SectionActions,
  TABLE_CONTAINER_LOADING_STYLE,
  TABLE_CONTAINER_STYLE,
  TABLE_STYLE,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { featsGroupedQuery, featsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type FeatsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["$get"], 200>;
type Feat = FeatsPaginated["items"][number];

type GroupedPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["grouped"]["$get"], 200>;
type GroupedFeatRow = GroupedPaginated["items"][number];

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
}: {
  row: GroupedFeatRow;
  rulesetId: string;
  childOnly: boolean;
  /** Set on a row that groups several variants. */
  family: string | null;
  isExpanded: boolean;
  rowIndex: number;
  onToggleFamily: (family: string) => void;
  onVariantClick: (feat: Feat) => void;
  onVariantMouseEnter: (feat: Feat) => void;
  onRowClick: (feat: Pick<Feat, "id">) => void;
  onRowMouseEnter: (feat: Pick<Feat, "id">) => void;
}) {
  const variantQuery = useInfiniteQuery({
    queryKey: queryKeys.rulesets.familyVariants(rulesetId, family ?? "", childOnly),
    queryFn: family
      ? async ({ pageParam }) => {
          return parseResponse(
            rpc.api.rulesets[":id"].feats.$get({
              param: { id: rulesetId },
              query: {
                limit: "50",
                page: pageParam.toString(),
                family,
                childOnly: childOnly ? "true" : undefined,
              },
            }),
          );
        }
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: isExpanded,
  });

  const variants = pageItems(variantQuery.data);

  if (family !== null) {
    return (
      <>
        <TableRow
          hover
          {...clickableProps(() => onToggleFamily(family))}
          aria-expanded={isExpanded}
          sx={{ ...CLICKABLE_SX, ...fadeInUpSx(rowIndex) }}
        >
          <TableCell>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {row.displayName}
              </Typography>
            </Box>
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
        {isExpanded &&
          variants.map((feat, i) => {
            const pages = variantQuery.data?.pages ?? [];
            const previousItemCount = pages.slice(0, -1).reduce((sum, p) => sum + p.items.length, 0);
            const isNew = i >= previousItemCount;
            return (
              <TableRow
                key={feat.id}
                hover
                {...clickableProps(() => onVariantClick(feat))}
                onMouseEnter={() => onVariantMouseEnter(feat)}
                onFocus={() => onVariantMouseEnter(feat)}
                sx={{ ...CLICKABLE_SX, ...(isNew ? fadeInUpSx(i - previousItemCount) : undefined) }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  variantQuery.fetchNextPage();
                }}
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

  const [searchQuery, setSearchQuery] = useSearchParam("search");
  const [selectedAptitude, setSelectedAptitude] = useState<Aptitude | null>(null);
  const [groupedParam, setGroupedParam] = useSearchParam("grouped", "true");
  const grouped = groupedParam === "true";
  const [expandedFamilies, toggleFamily, collapseFamilies] = useToggleSet();

  const { setCreateDialogOpen, createForm, createDialogProps } = useRulesetSection<Feat, FeatFormData>({
    rulesetId: ruleset.id,
    sectionName: "feats",
    label: "Feat",
    createFn: async (data) => {
      if (!data.aptitudeIds?.length) {
        throw new Error("At least one aptitude must be selected");
      }
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
        <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_LOADING_STYLE}>
          <Table sx={TABLE_STYLE}>
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

    if (groupedFeats.length === 0) {
      return searchQuery ? (
        <NoMatchesState search={searchQuery} />
      ) : (
        <BlankState icon={FeatsIcon} title="No feats" description="No feats available for this ruleset." />
      );
    }

    let rowIndex = 0;

    return (
      <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_STYLE}>
        <Table sx={TABLE_STYLE}>
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
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search feats..."
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
              Group families
            </ToggleButton>
          </SectionActions>
        }
      />

      {grouped ? (
        renderGroupedTable()
      ) : (
        <RulesetSectionTable
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

      <CreateDialog {...createDialogProps} title="Create New Feat">
        <FeatFormFields form={createForm} rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
