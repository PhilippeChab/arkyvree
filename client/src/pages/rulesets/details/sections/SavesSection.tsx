import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  EmptyValue,
  LoadError,
  LoadMoreButton,
  SectionContent,
  type TableColumn,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { SavesIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetAbilities, useSearchText } from "@/client/src/hooks/index.ts";
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
import { saveQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { savesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  type Save,
  useEntityColumns,
  useOpenEntity,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const SAVES_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "25%" },
  { key: "description", label: "Description", width: "45%", slot: "block" },
  { key: "ability", label: "Linked Ability", width: "30%" },
];

export function SavesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { columns: formColumns } = useEntityColumns(ruleset.id, "saves");
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Save, EntityFormData>({
    createDefaults: toEntityForm<EntityFormData>(formColumns),
    rulesetId: ruleset.id,
    sectionName: "saves",
    label: "Save",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].saves.$post({
          param: { id: ruleset.id },
          json: toEntityBody<EntityFormData, EntityFormData>(formColumns, data),
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

  const handleRowClick = (save: Save) => {
    openEntity(`saves/${save.id}`);
  };

  const handleRowPrefetch = (save: Save) => {
    void queryClient.prefetchQuery(saveQuery(ruleset.id, save.id));
  };

  const renderCell = (save: Save, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return save.name;
      case "description":
        return <DescriptionCell text={save.description} />;
      case "ability": {
        const abilityName = abilityLookup.get(save.abilityId);
        return abilityName ? <ValueChip label={abilityName} /> : <EmptyValue />;
      }
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search saves…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Save"
          onAdd={handleCreate}
        />
        <Stack spacing={2}>
          {!!abilitiesError && abilities.length === 0 && <LoadError what="Abilities" error={abilitiesError} />}
          <RulesetSectionTable
            what="Saves"
            error={error}
            data={saves}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={SAVES_COLUMNS}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState
                icon={SavesIcon}
                title="No saves"
                description="No saving throws available for this ruleset."
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

      <CreateDialog {...createDialogProps} title="Create New Save">
        <RulesetEntityFormFields form={createForm} entityType="saves" rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
