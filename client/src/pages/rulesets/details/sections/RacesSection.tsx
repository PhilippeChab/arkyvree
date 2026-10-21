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
import { RacesIcon } from "@/client/src/components/icons/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type RaceFormData,
  RaceFormFields,
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
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { racesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useEntityColumns,
  useEntityFields,
  useEntityFilters,
  useEntityList,
  useOpenEntity,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

type Race = InferResponseType<(typeof rpc.api.rulesets)[":id"]["races"]["$get"], 200>["items"][number];

export function RacesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search, kind, orderBy, orderDir, searchBarProps } = useEntityFilters(ruleset.baseRules);

  const { fields: raceFields } = useEntityFields(ruleset.id, "races");
  const { columns: raceColumns } = useEntityColumns(ruleset.id, "races");
  const { columns, error: listError, list, names } = useEntityList(ruleset.id, "races");
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Race, RaceFormData>({
    rulesetId: ruleset.id,
    sectionName: "races",
    createDefaults: withEntityFields(toEntityForm<RaceFormData>(raceColumns), raceFields),
    label: "Race",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].races.$post({
          param: { id: ruleset.id },
          json: toEntityBody<RaceFormData, RaceFormData>(raceColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(buildCustomizationPath("races", created.id)),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...racesQuery(ruleset.id, { search, childOnly, kind, orderBy, orderDir }),
    placeholderData: keepPreviousData,
  });

  const races = pageItems(data);

  const handleRowClick = (race: Race) => {
    openEntity(buildCustomizationPath("races", race.id));
  };

  const handleRowPrefetch = (race: Race) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "races", race.id));
  };

  const renderCell = (race: Race, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return race.name;
      case "description":
        return <DescriptionCell text={race.description} />;
      default: {
        const column = list?.columns.find((own) => own.key === columnKey);
        return column && <ListValue column={column} entity={race} names={names} />;
      }
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchBarProps}
          searchPlaceholder="Search races…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Race"
          onAdd={handleCreate}
        />
        {!!listError && <LoadError what="References" error={listError} />}
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Races"
            error={error}
            data={races}
            animationOffset={itemsBeforeLastPage(data)}
            search={search}
            isLoading={isLoading}
            columns={columns}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={<BlankState icon={RacesIcon} title="No races" description="No races available for this ruleset." />}
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Race">
        <RaceFormFields form={createForm} rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
