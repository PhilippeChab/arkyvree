import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback } from "react";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { MechanicsIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  EMPTY_MECHANIC,
  type MechanicFormData,
  MechanicFormFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { mechanicQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { mechanicsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type MechanicsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["mechanics"]["$get"], 200>;
type Mechanic = MechanicsPaginated["items"][number];

const MECHANICS_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

export function MechanicsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Mechanic, MechanicFormData>({
    createDefaults: EMPTY_MECHANIC,
    rulesetId: ruleset.id,
    sectionName: "mechanics",
    label: "Mechanic",
    createFn: async (data) => {
      return parseResponse(
        rpc.api.rulesets[":id"].mechanics.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      );
    },
    onCreateSuccess: (created) => openEntity(`mechanics/${created.id}`),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...mechanicsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const mechanics = pageItems(data);

  const handleRowClick = (mechanic: Mechanic) => {
    openEntity(`mechanics/${mechanic.id}`);
  };

  const handleRowMouseEnter = useCallback(
    (mechanic: Mechanic) => {
      void queryClient.prefetchQuery(mechanicQuery(ruleset.id, mechanic.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (mechanic: Mechanic, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return mechanic.name;
      case "description":
        return <DescriptionCell text={mechanic.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <SearchBar
        {...searchTextProps}
        searchPlaceholder="Search mechanics..."
        actions={
          <SectionActions
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel="Add Mechanic"
            onAdd={handleCreate}
          />
        }
      />

      <RulesetSectionTable
        data={mechanics}
        search={searchQuery}
        isLoading={isLoading}
        columns={MECHANICS_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={MechanicsIcon}
        emptyTitle="No mechanics"
        emptyDescription="No mechanics documented for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog {...createDialogProps} title="Create New Mechanic" maxWidth="md">
        <MechanicFormFields form={createForm} />
      </CreateDialog>
    </SectionContent>
  );
}
