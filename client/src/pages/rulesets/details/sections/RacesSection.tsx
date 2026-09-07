import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import { ENTITY_SORT_OPTIONS, KIND_FILTER_OPTIONS, type EntityKind, type EntitySortField } from "./kindFilterOptions.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  People as RacesIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { SIZE_OPTIONS } from "@/shared/enums.ts";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const RACES_COLUMNS = [
  { key: "name", label: "Name", width: "15%" },
  { key: "size", label: "Size", width: "10%" },
  { key: "speed", label: "Speed", width: "10%" },
  { key: "description", label: "Description", width: "65%" },
];


type RacesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["races"]["$get"]>;
type RacesPaginated = Exclude<RacesResponse, { error: string }>;
type Race = RacesPaginated["items"][number];

type RaceFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["races"]["$post"]>["json"];

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

  const kindFilter: EntityKind = (KIND_FILTER_OPTIONS.find((o) => o.value === kindParam)?.value ?? "pc") as EntityKind;
  const sortField = (orderByParam as EntitySortField) || "name";
  const sortDirection = (orderDirParam as "asc" | "desc") || "asc";

  const {
    currentUserId,
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Race, RaceFormData>({
    rulesetId: ruleset.id,
    sectionName: "races",
    label: "Race",
    createFn: async (data) => {
      const response = await rpc.api.rulesets[":id"].races.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create race");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/races/${(data as { id: string }).id}/customization`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "races"), searchQuery, childOnly, kindFilter, sortField, sortDirection],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].races.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
          kind: kindFilter,
          orderBy: sortField,
          orderDir: sortDirection,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch races");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const races = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleRowClick = (race: Race) => {
    navigate(`/rulesets/${ruleset.id}/races/${race.id}/customization`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((race: Race) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "races", race.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].races[":raceId"].$get({
          param: { id: ruleset.id, raceId: race.id },
        });
        if (!response.ok) throw new Error("Failed to fetch race");
        return response.json();
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
        emptyIcon={<RacesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No races"
        emptyDescription="No races available for this ruleset."
      />

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
        title="Create New Race"
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
        <FormControl fullWidth>
          <InputLabel>Size</InputLabel>
          <Select
            {...createForm.register("size")}
            label="Size"
            defaultValue="Medium"
          >
            {SIZE_OPTIONS.map((size) => (
              <MenuItem key={size} value={size}>{size}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          {...createForm.register("baseSpeed", { valueAsNumber: true })}
          label="Base Speed (feet)"
          type="number"
          fullWidth
          defaultValue={30}
        />
      </CreateDialog>
    </Box>
  );
}
