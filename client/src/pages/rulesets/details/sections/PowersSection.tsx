import { Box, Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  LoadError,
  LoadMoreButton,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { PowersIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type ColumnContext,
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  AptitudeAutocomplete,
  DescriptionCell,
  ListValue,
  RulesetSectionTable,
  SectionSearchBar,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { type Power, powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useAptitudeFilter,
  useEntityColumns,
  useEntityFields,
  useEntityList,
  useOpenEntity,
  useRulesetRules,
  useRulesetSection,
  useSpellLevelFilter,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

/** A new power's form: it needs a pool (a 3.5 spell, a spell list). */
const NEW_POWER: ColumnContext = { newEntity: true };

/** A ruleset's powers, named in its rules' words (3.5's are spells), by pool and level. */
export function PowersSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const { aptitude, aptitudeError, aptitudeId, setAptitude } = useAptitudeFilter(ruleset.id);
  const { level: selectedLevel, setLevel: setSelectedLevel } = useSpellLevelFilter(ruleset.baseRules, true);

  const { fields: powerFields } = useEntityFields(ruleset.id, "powers");
  const { columns: powerColumns } = useEntityColumns(ruleset.id, "powers");
  const { columns, error: listError, list, names } = useEntityList(ruleset.id, "powers");
  const words = useRulesetRules(ruleset.id).rules?.words;
  const one = entityTypeLabel("powers", words);
  const many = entityTypeLabel("powers", words, true);
  const { createForm, createDialogProps, handleCreate } = useRulesetSection<Power, EntityFormData>({
    createDefaults: withEntityFields(toEntityForm<EntityFormData>(powerColumns), powerFields),
    rulesetId: ruleset.id,
    sectionName: "powers",
    label: one,
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers.$post({
          param: { id: ruleset.id },
          json: toEntityBody<EntityFormData, EntityFormData>(powerColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(buildCustomizationPath("powers", created.id)),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...powersQuery(ruleset.id, {
      search: searchQuery,
      childOnly,
      aptitudeId,
      level: selectedLevel === "" ? undefined : selectedLevel,
    }),
    placeholderData: keepPreviousData,
  });

  const powers = pageItems(data);

  const handleRowClick = (power: Power) => {
    openEntity(buildCustomizationPath("powers", power.id));
  };

  const handleRowPrefetch = (power: Power) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "powers", power.id));
  };

  const renderCell = (power: Power, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return power.name;
      case "description":
        return <DescriptionCell text={power.description} />;
      default: {
        const column = list?.columns.find((own) => own.key === columnKey);
        return column && <ListValue column={column} entity={power} names={names} />;
      }
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder={`Search ${many.toLowerCase()}…`}
          filters={
            <>
              <Box sx={{ width: { xs: "100%", md: 200 } }}>
                <AptitudeAutocomplete
                  rulesetId={ruleset.id}
                  value={aptitude}
                  loadError={aptitudeError}
                  onChange={setAptitude}
                  scope="spells"
                />
              </Box>
              <SpellLevelFilter
                baseRules={ruleset.baseRules}
                value={selectedLevel}
                onChange={setSelectedLevel}
                allowAll
              />
            </>
          }
          filtered={!!aptitudeId || selectedLevel !== ""}
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel={`Add ${one}`}
          onAdd={handleCreate}
        />
        {!!listError && <LoadError what="References" error={listError} />}
        <Stack spacing={2}>
          <RulesetSectionTable
            what={many}
            error={error}
            data={powers}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={columns}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState
                icon={PowersIcon}
                title={`No ${many.toLowerCase()}`}
                description={`No ${many.toLowerCase()} available for this ruleset.`}
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

      <CreateDialog {...createDialogProps} title={`Create New ${one}`} maxWidth="md" fixedHeight>
        <RulesetEntityFormFields
          form={createForm}
          entityType="powers"
          rulesetId={ruleset.id}
          columns={2}
          context={NEW_POWER}
        />
      </CreateDialog>
    </SectionContent>
  );
}
