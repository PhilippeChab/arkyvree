import { Stack, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useCallback } from "react";

import {
  CreateDialog,
  EmptyValue,
  LoadError,
  LoadMoreButton,
  SearchBar,
  SectionContent,
  StatusChip,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { SkillsIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetAbilities, useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  EMPTY_SKILL,
  type SkillFormData,
  SkillFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { skillQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { skillsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Skill = SkillsPaginated["items"][number];
type SkillsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["skills"]["$get"], 200>;

const SKILLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "ability", label: "Ability", width: "15%" },
  { key: "trainedOnly", label: "Trained Only", width: "15%" },
  { key: "description", label: "Description", width: "45%" },
];

export function SkillsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Skill, SkillFormData>({
    rulesetId: ruleset.id,
    sectionName: "skills",
    createDefaults: EMPTY_SKILL,
    label: "Skill",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].skills.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      ),
    onCreateSuccess: (created) => openEntity(`skills/${created.id}`),
  });

  const { data: rulesetAbilities = [], error: abilitiesError } = useRulesetAbilities(ruleset.id);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...skillsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const skills = pageItems(data);

  const handleRowClick = (skill: Skill) => {
    openEntity(`skills/${skill.id}`);
  };

  const handleRowMouseEnter = useCallback(
    (skill: Skill) => {
      void queryClient.prefetchQuery(skillQuery(ruleset.id, skill.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (skill: Skill, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return skill.name;
      case "ability": {
        const abilityName = rulesetAbilities.find((a) => a.id === skill.primaryAbilityId)?.name;
        return abilityName ? <ValueChip label={abilityName} /> : <EmptyValue />;
      }
      case "trainedOnly":
        return skill.usableWithoutTraining === false ? (
          <StatusChip label="Yes" color="warning" />
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No
          </Typography>
        );
      case "description":
        return <DescriptionCell text={skill.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search skills…"
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
        <Stack spacing={2}>
          {!!abilitiesError && rulesetAbilities.length === 0 && <LoadError what="Abilities" error={abilitiesError} />}
          <RulesetSectionTable
            what="Skills"
            error={error}
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
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Skill">
        <SkillFormFields form={createForm} abilities={rulesetAbilities} abilitiesError={abilitiesError} />
      </CreateDialog>
    </SectionContent>
  );
}
