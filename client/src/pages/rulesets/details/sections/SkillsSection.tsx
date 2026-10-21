import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  LoadError,
  LoadMoreButton,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { SkillsIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type SkillFormData,
  SkillFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  DescriptionCell,
  ListValue,
  RulesetSectionTable,
  SectionSearchBar,
} from "@/client/src/pages/rulesets/components/index.ts";
import { skillQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { skillsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useEntityColumns,
  useEntityFields,
  useEntityList,
  useOpenEntity,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Skill = InferResponseType<(typeof rpc.api.rulesets)[":id"]["skills"]["$get"], 200>["items"][number];

export function SkillsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { fields: skillFields } = useEntityFields(ruleset.id, "skills");
  const { columns: skillColumns } = useEntityColumns(ruleset.id, "skills");
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Skill, SkillFormData>({
    rulesetId: ruleset.id,
    sectionName: "skills",
    createDefaults: withEntityFields(toEntityForm<SkillFormData>(skillColumns), skillFields),
    label: "Skill",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].skills.$post({
          param: { id: ruleset.id },
          json: toEntityBody<SkillFormData, SkillFormData>(skillColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(`skills/${created.id}`),
  });

  const { columns, error: listError, list, names } = useEntityList(ruleset.id, "skills");

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...skillsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const skills = pageItems(data);

  const handleRowClick = (skill: Skill) => {
    openEntity(`skills/${skill.id}`);
  };

  const handleRowPrefetch = (skill: Skill) => {
    void queryClient.prefetchQuery(skillQuery(ruleset.id, skill.id));
  };

  const renderCell = (skill: Skill, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return skill.name;
      case "description":
        return <DescriptionCell text={skill.description} />;
      default: {
        const column = list?.columns.find((own) => own.key === columnKey);
        return column && <ListValue column={column} entity={skill} names={names} />;
      }
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search skills…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Skill"
          onAdd={handleCreate}
        />
        <Stack spacing={2}>
          {!!listError && <LoadError what="References" error={listError} />}
          <RulesetSectionTable
            what="Skills"
            error={error}
            data={skills}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={columns}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState icon={SkillsIcon} title="No skills" description="No skills available for this ruleset." />
            }
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Skill">
        <SkillFormFields form={createForm} rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
