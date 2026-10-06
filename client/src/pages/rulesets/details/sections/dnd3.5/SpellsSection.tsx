import { Box } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useState } from "react";

import { CreateDialog, LoadMoreButton, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import { type Aptitude, AptitudeAutocomplete } from "@/client/src/components/customization/index.ts";
import { SpellsIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetSaves, useSearchParam, useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  EMPTY_SPELL,
  type SpellFormData,
  SpellFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import {
  AptitudeChipsCell,
  DescriptionCell,
  RulesetSectionTable,
  SectionActions,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type SpellsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"], 200>;
type Spell = SpellsPaginated["items"][number];

const SPELLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];

export function SpellsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const [selectedAptitude, setSelectedAptitude] = useState<Aptitude | null>(null);
  const [levelParam, setLevelParam] = useSearchParam("level");
  const parsed = Number(levelParam);
  const selectedLevel: number | "" = levelParam === "" || Number.isNaN(parsed) ? "" : parsed;

  const { createDialogOpen, setCreateDialogOpen, createForm, createDialogProps } = useRulesetSection<
    Spell,
    SpellFormData
  >({
    createDefaults: EMPTY_SPELL,
    rulesetId: ruleset.id,
    sectionName: "powers",
    label: "Spell",
    createFn: async (data) => {
      if (!data.aptitudes?.length) {
        throw new Error("At least one aptitude must be selected");
      }
      return parseResponse(rpc.api.rulesets[":id"].powers.$post({ param: { id: ruleset.id }, json: data }));
    },
    onCreateSuccess: (created) => openEntity(`powers/${created.id}/customization`),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...powersQuery(ruleset.id, {
      search: searchQuery,
      childOnly,
      aptitudeId: selectedAptitude?.id,
      level: selectedLevel === "" ? undefined : selectedLevel,
    }),
    placeholderData: keepPreviousData,
  });

  const spells = pageItems(data);

  const { data: createSaves = [] } = useRulesetSaves(ruleset.id, createDialogOpen);

  const handleCreate = () => {
    createForm.reset();
    setCreateDialogOpen(true);
  };

  const handleRowClick = (spell: Spell) => {
    openEntity(`powers/${spell.id}/customization`);
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
      <SearchBar
        {...searchTextProps}
        searchPlaceholder="Search spells..."
        filters={
          <>
            <Box sx={{ width: { xs: "100%", sm: 200 } }}>
              <AptitudeAutocomplete
                rulesetId={ruleset.id}
                value={selectedAptitude}
                onChange={setSelectedAptitude}
                size="small"
                scope="spells"
              />
            </Box>
            <SpellLevelFilter value={selectedLevel} onChange={(level) => setLevelParam(String(level))} allowAll />
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

      <RulesetSectionTable
        data={spells}
        search={searchQuery}
        isLoading={isLoading}
        columns={SPELLS_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={SpellsIcon}
        emptyTitle="No spells"
        emptyDescription="No spells available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog {...createDialogProps} title="Create New Spell" maxWidth="md" fixedHeight>
        <SpellFormFields form={createForm} rulesetId={ruleset.id} saves={createSaves} />
      </CreateDialog>
    </SectionContent>
  );
}
