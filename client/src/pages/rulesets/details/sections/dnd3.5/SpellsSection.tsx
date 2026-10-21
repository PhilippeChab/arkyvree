import { Box, Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  LoadMoreButton,
  SectionContent,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import { PowersIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type ColumnContext,
  type PowerFormData,
  PowerFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  AptitudeAutocomplete,
  AptitudeChipsCell,
  DescriptionCell,
  RulesetSectionTable,
  SectionSearchBar,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { type Power, powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useAptitudeFilter,
  useEntityColumns,
  useEntityFields,
  useOpenEntity,
  useRulesetSection,
  useSpellLevelFilter,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

/** A new spell's form: it needs a spell list. */
const NEW_POWER: ColumnContext = { newEntity: true };

const SPELLS_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%", slot: "inline" },
  { key: "description", label: "Description", width: "60%", slot: "block" },
];

export function SpellsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const { aptitude, aptitudeError, aptitudeId, setAptitude } = useAptitudeFilter(ruleset.id);
  const { level: selectedLevel, setLevel: setSelectedLevel } = useSpellLevelFilter(ruleset.baseRules, true);

  const { fields: spellFields } = useEntityFields(ruleset.id, "powers");
  const { columns: spellColumns } = useEntityColumns(ruleset.id, "powers");
  const { createForm, createDialogProps, handleCreate } = useRulesetSection<Power, PowerFormData>({
    createDefaults: withEntityFields(toEntityForm<PowerFormData>(spellColumns), spellFields),
    rulesetId: ruleset.id,
    sectionName: "powers",
    label: "Spell",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers.$post({
          param: { id: ruleset.id },
          json: toEntityBody<PowerFormData, PowerFormData>(spellColumns, data),
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

  const spells = pageItems(data);

  const handleRowClick = (spell: Power) => {
    openEntity(buildCustomizationPath("powers", spell.id));
  };

  const handleRowPrefetch = (spell: Power) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "powers", spell.id));
  };

  const renderCell = (spell: Power, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return spell.name;
      case "aptitudes":
        return <AptitudeChipsCell links={spell.powersAptitudesInRules} />;
      case "description":
        return <DescriptionCell text={spell.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search spells…"
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
          addLabel="Add Spell"
          onAdd={handleCreate}
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Spells"
            error={error}
            data={spells}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={SPELLS_COLUMNS}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState icon={PowersIcon} title="No spells" description="No spells available for this ruleset." />
            }
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Spell" maxWidth="md" fixedHeight>
        <PowerFormFields form={createForm} rulesetId={ruleset.id} context={NEW_POWER} />
      </CreateDialog>
    </SectionContent>
  );
}
