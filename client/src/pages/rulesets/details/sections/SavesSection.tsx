import { Stack, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback } from "react";

import {
  CreateDialog,
  EmptyValue,
  LoadError,
  LoadMoreButton,
  SearchBar,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { SavesIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetAbilities, useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { EMPTY_SAVE, type SaveFormData, SaveFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { saveQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { savesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { type RulesetSave, useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const SAVES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "description", label: "Description", width: "45%" },
  { key: "ability", label: "Linked Ability", width: "30%" },
];

export function SavesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<RulesetSave, SaveFormData>({
    createDefaults: EMPTY_SAVE,
    rulesetId: ruleset.id,
    sectionName: "saves",
    label: "Save",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].saves.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      ),
    onCreateSuccess: (created) => openEntity(`saves/${created.id}`),
  });

  const { data: abilities = [], error: abilitiesError } = useRulesetAbilities(ruleset.id);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...savesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const saves = pageItems(data);
  const abilityLookup = new Map(abilities.map((a) => [a.id, a.name]));

  const handleRowClick = (save: RulesetSave) => {
    openEntity(`saves/${save.id}`);
  };

  const handleRowMouseEnter = useCallback(
    (save: RulesetSave) => {
      void queryClient.prefetchQuery(saveQuery(ruleset.id, save.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (save: RulesetSave, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return save.name;
      case "description":
        return <DescriptionCell text={save.description} />;
      case "ability":
        return <Typography variant="body2">{abilityLookup.get(save.abilityId) || <EmptyValue />}</Typography>;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search saves…"
          actions={
            <SectionActions
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={onChildOnlyChange}
              addLabel="Add Save"
              onAdd={handleCreate}
            />
          }
        />
        <Stack spacing={2}>
          {!!abilitiesError && abilities.length === 0 && <LoadError what="Abilities" error={abilitiesError} />}
          <RulesetSectionTable
            what="Saves"
            error={error}
            data={saves}
            search={searchQuery}
            isLoading={isLoading}
            columns={SAVES_COLUMNS}
            onRowClick={handleRowClick}
            onRowMouseEnter={handleRowMouseEnter}
            renderCell={renderCell}
            emptyIcon={SavesIcon}
            emptyTitle="No saves"
            emptyDescription="No saving throws available for this ruleset."
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Save">
        <SaveFormFields form={createForm} abilities={abilities} abilitiesError={abilitiesError} />
      </CreateDialog>
    </SectionContent>
  );
}
