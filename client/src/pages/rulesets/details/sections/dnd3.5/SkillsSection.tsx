import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Psychology as SkillsIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SkillsSectionProps } from "../../sectionFactory.ts";

type AbilitiesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"]>;
type AbilitiesPaginated = Exclude<AbilitiesResponse, { error: string }>;
type RulesetAbility = AbilitiesPaginated["items"][number];

const SKILLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "ability", label: "Ability", width: "15%" },
  { key: "trainedOnly", label: "Trained Only", width: "15%" },
  { key: "description", label: "Description", width: "45%" },
];

type SkillsResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["skills"]["$get"]>;
type SkillsPaginated = Exclude<SkillsResponse, { error: string }>;
type Skill = SkillsPaginated["items"][number];

type SkillFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"];

export function SkillsSection({ ruleset, childOnly, onChildOnlyChange }: SkillsSectionProps) {
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
  } = useRulesetSection<Skill, SkillFormData>({
    rulesetId: ruleset.id,
    sectionName: "skills",
    label: "Skill",
    createFn: async (data) => {
      const response = await rpc.api.rulesets[":id"].skills.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create skill");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/skills/${(data as { id: string }).id}`, { state: { from: location.pathname + location.search } }),
  });

  // Fetch abilities for the primary ability select
  const { data: abilitiesData } = useQuery({
    queryKey: queryKeys.rulesets.section(ruleset.id, "abilities"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].abilities.$get({
        param: { id: ruleset.id },
        query: { limit: "100", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch abilities");
      return response.json();
    },
  });

  const rulesetAbilities: RulesetAbility[] = abilitiesData?.items ?? [];

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "skills"), searchQuery, childOnly],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].skills.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch skills");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const skills = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleRowClick = useCallback((skill: Skill) => {
    navigate(`/rulesets/${ruleset.id}/skills/${skill.id}`, { state: { from: location.pathname + location.search } });
  }, [navigate, ruleset.id, location.pathname, location.search]);

  const handleRowMouseEnter = useCallback((skill: Skill) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "skills", skill.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].skills[":skillId"].$get({
          param: { id: ruleset.id, skillId: skill.id },
        });
        if (!response.ok) throw new Error("Failed to fetch skill");
        return response.json();
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (skill: Skill, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return skill.name;
      case "ability": {
        const abilityName = rulesetAbilities.find((a) => a.id === skill.primaryAbilityId)?.name ?? "Unknown";
        return (
          <Chip
            label={abilityName}
            size="small"
            color="primary"
            variant="outlined"
          />
        );
      }
      case "trainedOnly":
        return skill.usableWithoutTraining === false
          ? <Chip label="Yes" size="small" color="warning" />
          : (
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              No
            </Typography>
          );
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {skill.description || "-"}
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
        searchPlaceholder="Search skills..."
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
                Add Skill
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={skills}
        isLoading={isLoading}
        columns={SKILLS_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={<SkillsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No skills"
        emptyDescription="No skills available for this ruleset."
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
        title="Create New Skill"
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
          <InputLabel>Primary Ability</InputLabel>
          <Select
            {...createForm.register("primaryAbilityId", {
              required: "Primary ability is required",
            })}
            label="Primary Ability"
            defaultValue=""
          >
            {rulesetAbilities.map((ability) => (
              <MenuItem key={ability.id} value={ability.id}>{ability.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box>
          <Typography variant="body2" gutterBottom>Impacted by Weight</Typography>
          <Switch {...createForm.register("impactedByWeight")} />
        </Box>
        <Box>
          <Typography variant="body2" gutterBottom>Usable Without Training</Typography>
          <Switch {...createForm.register("usableWithoutTraining")} />
        </Box>
      </CreateDialog>

    </Box>
  );
}
