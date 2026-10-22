import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  LoadMoreButton,
  SectionContent,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import { AptitudesIcon } from "@/client/src/components/icons/index.ts";
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
import { aptitudeQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { type Aptitude, aptitudesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useEntityColumns, useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const APTITUDES_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%", slot: "block" },
];

export function AptitudesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { columns: formColumns } = useEntityColumns(ruleset.id, "aptitudes");
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Aptitude, EntityFormData>({
    createDefaults: toEntityForm<EntityFormData>(formColumns),
    rulesetId: ruleset.id,
    sectionName: "aptitudes",
    label: "Aptitude",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].aptitudes.$post({
          param: { id: ruleset.id },
          json: toEntityBody<EntityFormData, EntityFormData>(formColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(`aptitudes/${created.id}`),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...aptitudesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const aptitudes = pageItems(data);

  const handleRowClick = (aptitude: Aptitude) => {
    openEntity(`aptitudes/${aptitude.id}`);
  };

  const handleRowPrefetch = (aptitude: Aptitude) => {
    void queryClient.prefetchQuery(aptitudeQuery(ruleset.id, aptitude.id));
  };

  const renderCell = (aptitude: Aptitude, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return aptitude.name;
      case "description":
        return <DescriptionCell text={aptitude.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search aptitudes…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Aptitude"
          onAdd={handleCreate}
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Aptitudes"
            error={error}
            data={aptitudes}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={APTITUDES_COLUMNS}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState
                icon={AptitudesIcon}
                title="No aptitudes"
                description="No aptitudes available for this ruleset."
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

      <CreateDialog {...createDialogProps} title="Create New Aptitude">
        <RulesetEntityFormFields form={createForm} entityType="aptitudes" rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
