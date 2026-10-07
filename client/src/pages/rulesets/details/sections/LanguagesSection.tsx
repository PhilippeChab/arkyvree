import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback } from "react";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { LanguagesIcon } from "@/client/src/components/icons/index.ts";
import { type RulesetLanguage, useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  EMPTY_LANGUAGE,
  type LanguageFormData,
  LanguageFormFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { languageQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { languagesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Language = RulesetLanguage;

const LANGUAGES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "20%" },
  { key: "description", label: "Description", width: "55%" },
];

export function LanguagesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Language, LanguageFormData>({
    createDefaults: EMPTY_LANGUAGE,
    rulesetId: ruleset.id,
    sectionName: "languages",
    label: "Language",
    createFn: async (data) => {
      return parseResponse(
        rpc.api.rulesets[":id"].languages.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      );
    },
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

  const handleRowMouseEnter = useCallback(
    (language: Language) => {
      void queryClient.prefetchQuery(languageQuery(ruleset.id, language.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (language: Language, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return language.name;
      case "type":
        return language.type || "—";
      case "description":
        return <DescriptionCell text={language.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search languages…"
          actions={
            <SectionActions
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={onChildOnlyChange}
              addLabel="Add Language"
              onAdd={handleCreate}
            />
          }
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Languages"
            error={error}
            data={languages}
            search={searchQuery}
            isLoading={isLoading}
            columns={LANGUAGES_COLUMNS}
            onRowClick={handleRowClick}
            onRowMouseEnter={handleRowMouseEnter}
            renderCell={renderCell}
            emptyIcon={LanguagesIcon}
            emptyTitle="No languages"
            emptyDescription="No languages available for this ruleset."
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Language">
        <LanguageFormFields form={createForm} />
      </CreateDialog>
    </SectionContent>
  );
}
