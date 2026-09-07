import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Shield as SavesIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SAVES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "description", label: "Description", width: "45%" },
  { key: "ability", label: "Linked Ability", width: "30%" },
];

type SavesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"]>;
type SavesPaginated = Exclude<SavesResponse, { error: string }>;
type Save = SavesPaginated["items"][number];

type SaveFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["saves"]["$post"]>["json"];

interface SavesSectionProps {
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

export function SavesSection({ ruleset, childOnly, onChildOnlyChange }: SavesSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");

  const {
    currentUserId,
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Save, SaveFormData>({
    rulesetId: ruleset.id,
    sectionName: "saves",
    label: "Save",
    createFn: async (data) => {
      const response = await rpc.api.rulesets[":id"].saves.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create save");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/saves/${(data as { id: string }).id}`, { state: { from: location.pathname + location.search } }),
  });

  // Fetch abilities for the abilityId dropdown
  const { data: abilitiesData } = useQuery({
    queryKey: queryKeys.rulesets.section(ruleset.id, "abilities"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].abilities.$get({
        param: { id: ruleset.id },
        query: { limit: "10", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch abilities");
      return response.json();
    },
  });
  const abilities = abilitiesData?.items ?? [];

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "saves"), searchQuery, childOnly],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].saves.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch saves");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const saves = data?.pages.flatMap((page) => page.items) ?? [];
  const abilityLookup = new Map(abilities.map((a) => [a.id, a.name]));

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleRowClick = (save: Save) => {
    navigate(`/rulesets/${ruleset.id}/saves/${save.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((save: Save) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "saves", save.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].saves[":saveId"].$get({
          param: { id: ruleset.id, saveId: save.id },
        });
        if (!response.ok) throw new Error("Failed to fetch save");
        return response.json();
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (save: Save, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return save.name;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {save.description || "-"}
          </Typography>
        );
      case "ability":
        return (
          <Typography variant="body2">
            {abilityLookup.get(save.abilityId) || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  const abilitySelect = (form: typeof createForm) => (
    <FormControl fullWidth>
      <InputLabel>Linked Ability</InputLabel>
      <Select
        {...form.register("abilityId", { required: "Ability is required" })}
        label="Linked Ability"
        value={form.watch("abilityId") || ""}
      >
        {abilities.map((ability) => (
          <MenuItem key={ability.id} value={ability.id}>
            {ability.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search saves..."
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
                Add Save
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={saves}
        isLoading={isLoading}
        columns={SAVES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={<SavesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No saves"
        emptyDescription="No saving throws available for this ruleset."
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
        title="Create New Save"
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
        {abilitySelect(createForm)}
      </CreateDialog>
    </Box>
  );
}
