import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { SkillFormFields, type SkillFormData } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Psychology as SkillsIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRulesetAbilities, useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SkillsSectionProps } from "../../sectionFactory.ts";
import { skillsQuery } from "../../sectionQueries.ts";


const SKILLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "ability", label: "Ability", width: "15%" },
  { key: "trainedOnly", label: "Trained Only", width: "15%" },
  { key: "description", label: "Description", width: "45%" },
];

type SkillsResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["skills"]["$get"]>;
type SkillsPaginated = Exclude<SkillsResponse, { error: string }>;
type Skill = SkillsPaginated["items"][number];


export function SkillsSection({ ruleset, childOnly, onChildOnlyChange }: SkillsSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Skill, SkillFormData>({
    rulesetId: ruleset.id,
    sectionName: "skills",
    createDefaults: { impactedByWeight: false, usableWithoutTraining: false },
    label: "Skill",
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].skills.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/skills/${created.id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data: rulesetAbilities = [] } = useRulesetAbilities(ruleset.id);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...skillsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const skills = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = useCallback((skill: Skill) => {
    navigate(`/rulesets/${ruleset.id}/skills/${skill.id}`, { state: { from: location.pathname + location.search } });
  }, [navigate, ruleset.id, location.pathname, location.search]);

  const handleRowMouseEnter = useCallback((skill: Skill) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "skills", skill.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].skills[":skillId"].$get({
          param: { id: ruleset.id, skillId: skill.id },
        }));
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

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Skill"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <SkillFormFields form={createForm} abilities={rulesetAbilities} />
      </CreateDialog>

    </Box>
  );
}
