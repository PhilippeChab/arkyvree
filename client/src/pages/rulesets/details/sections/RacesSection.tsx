import { Chip, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback } from "react";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { RacesIcon } from "@/client/src/components/icons/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { EMPTY_RACE, type RaceFormData, RaceFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useEntityFilters } from "@/client/src/pages/rulesets/details/entityFilters.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { racesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type RacesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["races"]["$get"], 200>;
type Race = RacesPaginated["items"][number];

const RACES_COLUMNS = [
  { key: "name", label: "Name", width: "15%" },
  { key: "size", label: "Size", width: "10%" },
  { key: "speed", label: "Speed", width: "10%" },
  { key: "description", label: "Description", width: "65%" },
];

export function RacesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search, kind, orderBy, orderDir, searchBarProps } = useEntityFilters();

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Race, RaceFormData>({
    rulesetId: ruleset.id,
    sectionName: "races",
    createDefaults: EMPTY_RACE,
    label: "Race",
    createFn: async (data) => {
      return parseResponse(
        rpc.api.rulesets[":id"].races.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      );
    },
    onCreateSuccess: (created) => openEntity(`races/${created.id}/customization`),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...racesQuery(ruleset.id, { search, childOnly, kind, orderBy, orderDir }),
    placeholderData: keepPreviousData,
  });

  const races = pageItems(data);

  const handleRowClick = (race: Race) => {
    openEntity(`races/${race.id}/customization`);
  };

  const handleRowMouseEnter = useCallback(
    (race: Race) => {
      void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "races", race.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (race: Race, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return race.name;
      case "size":
        return <Chip label={race.size} size="small" color="primary" variant="outlined" />;
      case "speed":
        return <Typography variant="body2">{race.baseSpeed} ft</Typography>;
      case "description":
        return <DescriptionCell text={race.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <SearchBar
        {...searchBarProps}
        searchPlaceholder="Search races..."
        actions={
          <SectionActions
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel="Add Race"
            onAdd={handleCreate}
          />
        }
      />

      <RulesetSectionTable
        data={races}
        search={search}
        isLoading={isLoading}
        columns={RACES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={RacesIcon}
        emptyTitle="No races"
        emptyDescription="No races available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog {...createDialogProps} title="Create New Race">
        <RaceFormFields form={createForm} />
      </CreateDialog>
    </SectionContent>
  );
}
