import { pageItems } from "@/client/src/lib/pageItems.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { type SkillFormData, SkillFormFields } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Psychology as SkillsIcon } from "@mui/icons-material";
import {
  Chip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRulesetAbilities, useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { skillQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { skillsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const SKILLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "ability", label: "Ability", width: "15%" },
  { key: "trainedOnly", label: "Trained Only", width: "15%" },
  { key: "description", label: "Description", width: "45%" },
];

type SkillsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["skills"]["$get"], 200>;
type Skill = SkillsPaginated["items"][number];

export function SkillsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useSearchParam("search");

  const {
    createForm,
    handleCreate,
    createDialogProps,
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
    onCreateSuccess: (created) => openEntity(`skills/${created.id}`),
  });

  const { data: rulesetAbilities = [] } = useRulesetAbilities(ruleset.id);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...skillsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const skills = pageItems(data);

  const handleRowClick = (skill: Skill) => {
    openEntity(`skills/${skill.id}`);
  };

  const handleRowMouseEnter = useCallback((skill: Skill) => {
    void queryClient.prefetchQuery(skillQuery(ruleset.id, skill.id));
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
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No
            </Typography>
          );
      case "description":
        return (
          <DescriptionCell text={skill.description} />
        );
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search skills..."
        actions={
          <SectionActions
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel="Add Skill"
            onAdd={handleCreate}
          />
        }
      />

      <RulesetSectionTable
        data={skills}
        search={searchQuery}
        isLoading={isLoading}
        columns={SKILLS_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={SkillsIcon}
        emptyTitle="No skills"
        emptyDescription="No skills available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        {...createDialogProps}
        title="Create New Skill"
      >
        <SkillFormFields form={createForm} abilities={rulesetAbilities} />
      </CreateDialog>

    </SectionContent>
  );
}
