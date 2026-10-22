import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  EmptyValue,
  LoadMoreButton,
  SectionContent,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import { LanguagesIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  DescriptionCell,
  RulesetSectionTable,
  SectionSearchBar,
} from "@/client/src/pages/rulesets/components/index.ts";
import { languageQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { languagesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useEntityColumns, useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Language = InferResponseType<(typeof rpc.api.rulesets)[":id"]["languages"]["$get"], 200>["items"][number];

const LANGUAGES_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "20%", slot: "inline" },
  { key: "description", label: "Description", width: "55%", slot: "block" },
];

export function LanguagesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { columns: formColumns } = useEntityColumns(ruleset.id, "languages");
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Language, EntityFormData>({
    createDefaults: toEntityForm<EntityFormData>(formColumns),
    rulesetId: ruleset.id,
    sectionName: "languages",
    label: "Language",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].languages.$post({
          param: { id: ruleset.id },
          json: toEntityBody<EntityFormData, EntityFormData>(formColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(`languages/${created.id}`),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...languagesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const languages = pageItems(data);

  const handleRowClick = (language: Language) => {
    openEntity(`languages/${language.id}`);
  };

  const handleRowPrefetch = (language: Language) => {
    void queryClient.prefetchQuery(languageQuery(ruleset.id, language.id));
  };

  const renderCell = (language: Language, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return language.name;
      case "type":
        return language.type || <EmptyValue />;
      case "description":
        return <DescriptionCell text={language.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search languages…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Language"
          onAdd={handleCreate}
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Languages"
            error={error}
            data={languages}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={LANGUAGES_COLUMNS}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState
                icon={LanguagesIcon}
                title="No languages"
                description="No languages available for this ruleset."
              />
            }
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Language">
        <RulesetEntityFormFields form={createForm} entityType="languages" rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
