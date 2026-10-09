import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { AptitudesIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type AptitudeFormData,
  AptitudeFormFields,
  EMPTY_APTITUDE,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { aptitudeQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { type Aptitude, aptitudesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const APTITUDES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

export function AptitudesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Aptitude, AptitudeFormData>({
    createDefaults: EMPTY_APTITUDE,
    rulesetId: ruleset.id,
    sectionName: "aptitudes",
    label: "Aptitude",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].aptitudes.$post({
          param: { id: ruleset.id },
          json: data,
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

  const handleRowMouseEnter = (aptitude: Aptitude) => {
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
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search aptitudes…"
          actions={
            <SectionActions
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={onChildOnlyChange}
              addLabel="Add Aptitude"
              onAdd={handleCreate}
            />
          }
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Aptitudes"
            error={error}
            data={aptitudes}
            search={searchQuery}
            isLoading={isLoading}
            columns={APTITUDES_COLUMNS}
            onRowClick={handleRowClick}
            onRowMouseEnter={handleRowMouseEnter}
            renderCell={renderCell}
            emptyIcon={AptitudesIcon}
            emptyTitle="No aptitudes"
            emptyDescription="No aptitudes available for this ruleset."
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Aptitude">
        <AptitudeFormFields form={createForm} />
      </CreateDialog>
    </SectionContent>
  );
}
