import { Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { SavesIcon } from "@/client/src/components/icons/index.ts";
import type { RulesetSave } from "@/client/src/hooks/index.ts";
import { useRulesetAbilities, useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { EMPTY_SAVE, type SaveFormData, SaveFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { saveQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { savesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type Save = RulesetSave;

const SAVES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "description", label: "Description", width: "45%" },
  { key: "ability", label: "Linked Ability", width: "30%" },
];

export function SavesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Save, SaveFormData>({
    createDefaults: EMPTY_SAVE,
    rulesetId: ruleset.id,
    sectionName: "saves",
    label: "Save",
    createFn: async (data) => {
      return parseResponse(
        rpc.api.rulesets[":id"].saves.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      );
    },
    onCreateSuccess: (created) => openEntity(`saves/${created.id}`),
  });

  const { data: abilities = [] } = useRulesetAbilities(ruleset.id);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...savesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const saves = pageItems(data);
  const abilityLookup = new Map(abilities.map((a) => [a.id, a.name]));

  const handleRowClick = (save: Save) => {
    openEntity(`saves/${save.id}`);
  };

  const handleRowMouseEnter = useCallback(
    (save: Save) => {
      void queryClient.prefetchQuery(saveQuery(ruleset.id, save.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (save: Save, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return save.name;
      case "description":
        return <DescriptionCell text={save.description} />;
      case "ability":
        return <Typography variant="body2">{abilityLookup.get(save.abilityId) || "—"}</Typography>;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <SearchBar
        {...searchTextProps}
        searchPlaceholder="Search saves..."
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

      <RulesetSectionTable
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

      <CreateDialog {...createDialogProps} title="Create New Save">
        <SaveFormFields form={createForm} abilities={abilities} />
      </CreateDialog>
    </SectionContent>
  );
}
