import {
  AptitudeAutocomplete,
  AptitudesAutocomplete,
  type Aptitude,
} from "@/client/src/components/customization/index.ts";
import {
  BlankState,
  CreateDialog,
  SearchBar,
  DiceSpinner,
} from "@/client/src/components/common/index.ts";
import {
  RulesetSectionTable,
  TABLE_CONTAINER_LOADING_STYLE,
  TABLE_CONTAINER_STYLE,
  TABLE_STYLE,
} from "@/client/src/pages/rulesets/components/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Spoke as FeatsIcon,
} from "@mui/icons-material";
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
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

type FeatsResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["$get"]>;
type FeatsPaginated = Exclude<FeatsResponse, { error: string }>;
type Feat = FeatsPaginated["items"][number];

type GroupedResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["feats"]["grouped"]["$get"]>;
type GroupedPaginated = Exclude<GroupedResponse, { error: string }>;
type GroupedFeatRow = GroupedPaginated["items"][number];

type FeatFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["feats"]["$post"]>["json"];

type FeatAptitude = {
  aptitudeId: string;
  aptitudesInRule?: Aptitude;
};

interface FeatsSectionProps {
  ruleset: {
    id: string;
    name: string;
    rulesetId?: string | null;
    userId?: string | null;
    status?: string;
  };
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export function FeatsSection({ ruleset, childOnly, onChildOnlyChange }: FeatsSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");
  const [selectedAptitude, setSelectedAptitude] = useState<Aptitude | null>(null);
  const [selectedCreateAptitudes, setSelectedCreateAptitudes] = useState<Aptitude[]>([]);
  const [groupedParam, setGroupedParam] = useSearchParam("grouped", "true");
  const grouped = groupedParam === "true";
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const {
    currentUserId,
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
  } = useRulesetSection<Feat, FeatFormData>({
    rulesetId: ruleset.id,
    sectionName: "feats",
    label: "Feat",
    createFn: async (data) => {
      if (selectedCreateAptitudes.length === 0) {
        throw new Error("At least one aptitude must be selected");
      }
      const response = await rpc.api.rulesets[":id"].feats.$post({
        param: { id: ruleset.id },
        json: {
          ...data,
          aptitudeIds: selectedCreateAptitudes.map((a) => a.id),
        },
      });
      if (!response.ok) throw new Error("Failed to create feat");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/feats/${(data as { id: string }).id}/customization`, { state: { from: location.pathname + location.search } }),
  });

  // Flat query (used when grouped is off)
  const flatQuery = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "feats"), searchQuery, childOnly, selectedAptitude?.id],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].feats.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
          aptitudeId: selectedAptitude?.id,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch feats");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
    enabled: !grouped,
  });

  // Grouped query (used when grouped is on)
  const groupedQuery = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.sectionGrouped(ruleset.id, "feats"), searchQuery, childOnly, selectedAptitude?.id],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].feats.grouped.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
          aptitudeId: selectedAptitude?.id,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch grouped feats");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
    enabled: grouped,
  });

  const feats = flatQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const groupedFeats = groupedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleCreate = () => {
    setSelectedCreateAptitudes([]);
    setCreateDialogOpen(true);
  };

  const handleRowClick = (feat: Feat) => {
    navigate(`/rulesets/${ruleset.id}/feats/${feat.id}/customization`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((feat: Feat) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "feats", feat.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].feats[":featId"].$get({
          param: { id: ruleset.id, featId: feat.id },
        });
        if (!response.ok) throw new Error("Failed to fetch feat");
        return response.json();
      },
    });
  }, [queryClient, ruleset.id]);

  const toggleFamily = (family: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  };

  const handleGroupedToggle = () => {
    setGroupedParam(grouped ? "false" : "true");
    setExpandedFamilies(new Set());
  };

  const renderCell = (feat: Feat, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return feat.name;
      case "aptitudes":
        return (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {feat.featsAptitudesInRules && feat.featsAptitudesInRules.length > 0
              ? (
                feat.featsAptitudesInRules.map((featAptitude: FeatAptitude) => (
                  <Chip
                    key={featAptitude.aptitudeId}
                    label={featAptitude.aptitudesInRule?.name || "Unknown"}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              )
              : (
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  -
                </Typography>
              )}
          </Box>
        );
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {feat.description || "-"}
          </Typography>
        );
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
                  <TableCell key={col.key} sx={{ width: col.width, fontWeight: 600 }}>{col.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {GROUPED_COLUMNS.map((col) => (
                    <TableCell key={col.key}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    if (groupedFeats.length === 0) {
      return (
        <BlankState
          icon={<FeatsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
          title="No feats"
          description="No feats available for this ruleset."
        />
      );
    }

    let rowIndex = 0;

    return (
      <TableContainer component={Paper} variant="outlined" sx={TABLE_CONTAINER_STYLE}>
        <Table sx={TABLE_STYLE}>
          <TableHead>
            <TableRow>
              {GROUPED_COLUMNS.map((col) => (
                <TableCell key={col.key} sx={{ width: col.width, fontWeight: 600 }}>{col.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedFeats.map((row) => {
              const isFamily = row.family !== null && row.variantCount > 1;
              const isExpanded = isFamily && expandedFamilies.has(row.family!);
              const currentIndex = rowIndex++;

              return (
                <GroupedRow
                  key={row.family ?? row.representativeId}
                  row={row}
                  rulesetId={ruleset.id}
                  childOnly={childOnly}
                  isFamily={isFamily}
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
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
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
          <>
            <ToggleButton
              value="grouped"
              selected={grouped}
              onChange={handleGroupedToggle}
              sx={{ textTransform: "none" }}
            >
              Group families
            </ToggleButton>
            {isFork && (
              <ToggleButton
                value="childOnly"
                selected={childOnly}
                onChange={() => onChildOnlyChange(!childOnly)}
                sx={{ textTransform: "none" }}
              >
                Local changes
              </ToggleButton>
            )}
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
              >
                Add Feat
              </Button>
            )}
          </>
        }
      />

      {grouped ? (
        renderGroupedTable()
      ) : (
        <RulesetSectionTable
          data={feats}
          isLoading={isLoading}
          columns={FEATS_COLUMNS}
          onRowClick={handleRowClick}
          onRowMouseEnter={handleRowMouseEnter}
          renderCell={renderCell}
          emptyIcon={<FeatsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
          emptyTitle="No feats"
          emptyDescription="No feats available for this ruleset."
        />
      )}

      {hasNextPage && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outlined"
          >
            <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
          </Button>
        </Box>
      )}

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Feat"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <TextField
          {...createForm.register("name", { required: "Name is required" })}
          label="Name"
          fullWidth
          error={!!createForm.formState.errors.name}
          helperText={createForm.formState.errors.name?.message}
        />
        <TextField
          {...createForm.register("description")}
          label="Description"
          fullWidth
          multiline
          minRows={3}
          sx={{ "& textarea": { resize: "vertical" } }}
        />
        <AptitudesAutocomplete
          rulesetId={ruleset.id}
          value={selectedCreateAptitudes}
          onChange={setSelectedCreateAptitudes}
        />
      </CreateDialog>
    </Box>
  );
}

function GroupedRow({
  row,
  rulesetId,
  childOnly,
  isFamily,
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
  isFamily: boolean;
  isExpanded: boolean;
  rowIndex: number;
  onToggleFamily: (family: string) => void;
  onVariantClick: (feat: Feat) => void;
  onVariantMouseEnter: (feat: Feat) => void;
  onRowClick: (feat: Feat) => void;
  onRowMouseEnter: (feat: Feat) => void;
}) {
  const variantQuery = useInfiniteQuery({
    queryKey: queryKeys.rulesets.familyVariants(rulesetId, row.family ?? ""),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].feats.$get({
        param: { id: rulesetId },
        query: {
          limit: "50",
          page: pageParam.toString(),
          family: row.family!,
          childOnly: childOnly ? "true" : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch family variants");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: isFamily && isExpanded,
  });

  const variants = variantQuery.data?.pages.flatMap((page) => page.items);

  if (isFamily) {
    return (
      <>
        <TableRow
          hover
          onClick={() => onToggleFamily(row.family!)}
          sx={{ cursor: "pointer", ...fadeInUpSx(rowIndex) }}
        >
          <TableCell>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.displayName}</Typography>
            </Box>
          </TableCell>
          <TableCell>
            <Chip label={`${row.variantCount} variants`} size="small" variant="outlined" />
          </TableCell>
        </TableRow>
        {isExpanded && variantQuery.isLoading && (
          <TableRow>
            <TableCell colSpan={2} sx={{ pl: 6 }}>
              <Skeleton variant="text" width="60%" />
            </TableCell>
          </TableRow>
        )}
        {isExpanded && variants?.map((feat, i) => {
          const pages = variantQuery.data?.pages ?? [];
          const previousItemCount = pages.slice(0, -1).reduce((sum, p) => sum + p.items.length, 0);
          const isNew = i >= previousItemCount;
          return (
            <TableRow
              key={feat.id}
              hover
              onClick={() => onVariantClick(feat)}
              onMouseEnter={() => onVariantMouseEnter(feat)}
              sx={{ cursor: "pointer", ...(isNew ? fadeInUpSx(i - previousItemCount) : undefined) }}
            >
              <TableCell sx={{ pl: 6 }}>
                <Typography variant="body2">{feat.name}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  {feat.description || "-"}
                </Typography>
              </TableCell>
            </TableRow>
          );
        })}
        {isExpanded && variantQuery.hasNextPage && (
          <TableRow>
            <TableCell colSpan={2} sx={{ pl: 6 }}>
              <Button
                size="small"
                onClick={(e) => { e.stopPropagation(); variantQuery.fetchNextPage(); }}
                disabled={variantQuery.isFetchingNextPage}
              >
                <DiceSpinner size="small" loading={variantQuery.isFetchingNextPage}>Load More</DiceSpinner>
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
      onClick={() => onRowClick({ id: row.representativeId } as Feat)}
      onMouseEnter={() => onRowMouseEnter({ id: row.representativeId } as Feat)}
      sx={{ cursor: "pointer", ...fadeInUpSx(rowIndex) }}
    >
      <TableCell>
        <Typography variant="body2">{row.displayName}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>-</Typography>
      </TableCell>
    </TableRow>
  );
}
