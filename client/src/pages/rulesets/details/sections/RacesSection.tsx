import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { RaceFormFields, type RaceFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { DEFAULT_ENTITY_FILTERS, ENTITY_SORT_OPTIONS, KIND_FILTER_OPTIONS, type EntityKind, type EntitySortField } from "./kindFilterOptions.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  People as RacesIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { racesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const RACES_COLUMNS = [
  { key: "name", label: "Name", width: "15%" },
  { key: "size", label: "Size", width: "10%" },
  { key: "speed", label: "Speed", width: "10%" },
  { key: "description", label: "Description", width: "65%" },
];


type RacesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["races"]["$get"]>;
type RacesPaginated = Exclude<RacesResponse, { error: string }>;
type Race = RacesPaginated["items"][number];


interface RacesSectionProps {
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

export function RacesSection({ ruleset, childOnly, onChildOnlyChange }: RacesSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");
  const [kindParam, setKindParam] = useSearchParam("kind");
  const [orderByParam, setOrderByParam] = useSearchParam("orderBy");
  const [orderDirParam, setOrderDirParam] = useSearchParam("orderDir");

  const kindFilter: EntityKind = (KIND_FILTER_OPTIONS.find((o) => o.value === kindParam)?.value ?? DEFAULT_ENTITY_FILTERS.kind) as EntityKind;
  const sortField = (orderByParam as EntitySortField) || DEFAULT_ENTITY_FILTERS.orderBy;
  const sortDirection = (orderDirParam as "asc" | "desc") || DEFAULT_ENTITY_FILTERS.orderDir;

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Race, RaceFormData>({
    rulesetId: ruleset.id,
    sectionName: "races",
    createDefaults: { size: "Medium", baseSpeed: 30 },
    label: "Race",
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].races.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/races/${created.id}/customization`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...racesQuery(ruleset.id, { search: searchQuery, childOnly, kind: kindFilter, orderBy: sortField, orderDir: sortDirection }),
    placeholderData: keepPreviousData,
  });

  const races = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (race: Race) => {
    navigate(`/rulesets/${ruleset.id}/races/${race.id}/customization`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((race: Race) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "races", race.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].races[":raceId"].$get({
          param: { id: ruleset.id, raceId: race.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (race: Race, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return race.name;
      case "size":
        return (
          <Chip
            label={race.size}
            size="small"
            color="primary"
            variant="outlined"
          />
        );
      case "speed":
        return (
          <Typography variant="body2">
            {race.baseSpeed} ft
          </Typography>
        );
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {race.description || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search races..."
        filterOptions={KIND_FILTER_OPTIONS}
        filterValue={kindFilter}
        onFilterChange={(value) => setKindParam(value ?? "pc")}
        sortOptions={ENTITY_SORT_OPTIONS}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setOrderByParam(field);
          setOrderDirParam(direction);
        }}
        actions={
          <>
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
                Add Race
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={races}
        isLoading={isLoading}
        columns={RACES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={RacesIcon}
        emptyTitle="No races"
        emptyDescription="No races available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Race"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <RaceFormFields form={createForm} />
      </CreateDialog>
    </Box>
  );
}
