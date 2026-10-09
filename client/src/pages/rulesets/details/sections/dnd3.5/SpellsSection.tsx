import { Box, Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useCallback } from "react";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { PowersIcon } from "@/client/src/components/icons/index.ts";
import { useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  EMPTY_SPELL,
  type SpellFormData,
  SpellFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import {
  AptitudeAutocomplete,
  AptitudeChipsCell,
  DescriptionCell,
  RulesetSectionTable,
  SectionActions,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useAptitudeFilter,
  useOpenEntity,
  useRulesetSaves,
  useRulesetSection,
  useSpellLevelFilter,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

/** A ruleset's spell (its power), as its list gives it. */
export type Spell = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"], 200>["items"][number];

const SPELLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];

export function SpellsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const { aptitude, aptitudeError, aptitudeId, setAptitude } = useAptitudeFilter(ruleset.id);
  const { level: selectedLevel, setLevel: setSelectedLevel } = useSpellLevelFilter(true);

  const { createForm, createDialogProps, handleCreate } = useRulesetSection<Spell, SpellFormData>({
    createDefaults: EMPTY_SPELL,
    rulesetId: ruleset.id,
    sectionName: "powers",
    label: "Spell",
    createFn: async (data) =>
      parseResponse(rpc.api.rulesets[":id"].powers.$post({ param: { id: ruleset.id }, json: data })),
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

  const { data: createSaves = [], error: createSavesError } = useRulesetSaves(ruleset.id, createDialogProps.open);

  const handleRowClick = (spell: Spell) => {
    openEntity(buildCustomizationPath("powers", spell.id));
  };

  const handleRowMouseEnter = useCallback(
    (spell: Spell) => {
      void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "powers", spell.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (spell: Spell, columnKey: string) => {
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
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search spells…"
          filters={
            <>
              <Box sx={{ width: { xs: "100%", sm: 200 } }}>
                <AptitudeAutocomplete
                  rulesetId={ruleset.id}
                  value={aptitude}
                  loadError={aptitudeError}
                  onChange={setAptitude}
                  scope="spells"
                />
              </Box>
              <SpellLevelFilter value={selectedLevel} onChange={setSelectedLevel} allowAll />
            </>
          }
          actions={
            <SectionActions
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={onChildOnlyChange}
              addLabel="Add Spell"
              onAdd={handleCreate}
            />
          }
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Spells"
            error={error}
            data={spells}
            search={searchQuery}
            isLoading={isLoading}
            columns={SPELLS_COLUMNS}
            onRowClick={handleRowClick}
            onRowMouseEnter={handleRowMouseEnter}
            renderCell={renderCell}
            emptyIcon={PowersIcon}
            emptyTitle="No spells"
            emptyDescription="No spells available for this ruleset."
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Spell" maxWidth="md" fixedHeight>
        <SpellFormFields
          form={createForm}
          rulesetId={ruleset.id}
          saves={createSaves}
          savesError={createSavesError}
          aptitudesRequired
        />
      </CreateDialog>
    </SectionContent>
  );
}
