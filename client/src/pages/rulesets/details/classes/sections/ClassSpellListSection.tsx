import { useOpenEntity } from "@/client/src/pages/rulesets/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { ClassSectionProps } from "./types.ts";
import { DescriptionCell, RulesetSectionTable, SpellLevelFilter } from "@/client/src/pages/rulesets/components/index.ts";
import { LoadMoreButton, SearchBar } from "@/client/src/components/common/index.ts";
import { type rpc } from "@/client/src/services/rpc.ts";
import { Bolt as SpellListIcon } from "@mui/icons-material";
import { Box } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { classSpellListQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

type SpellListPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["spell-list"]["$get"], 200>;
type Spell = SpellListPaginated["items"][number];

const COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

export function ClassSpellListSection({ rulesetId, classId, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const [selectedLevel, setSelectedLevel] = useState<number>(0);
  const [search, setSearch] = useState("");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...classSpellListQuery(rulesetId, classId, selectedLevel, search),
    placeholderData: keepPreviousData,
  });

  const spells = pageItems(data);

  const handleRowClick = (spell: Spell) => {
    openEntity(`powers/${spell.id}/customization`);
  };

  const renderCell = (spell: Spell, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return spell.name;
      case "description":
        return (
          <DescriptionCell text={spell.description} />
        );
      default:
        return null;
    }
  };

  return (
    <Box>
      <SearchBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search spells..."
        filters={<SpellLevelFilter value={selectedLevel} onChange={(level) => setSelectedLevel(Number(level))} />}
      />

      <RulesetSectionTable
        data={spells}
        search={search}
        isLoading={isLoading}
        columns={COLUMNS}
        onRowClick={handleRowClick}
        renderCell={renderCell}
        emptyIcon={SpellListIcon}
        emptyTitle="No spells"
        emptyDescription="No spells found for this class at the selected level."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />
    </Box>
  );
}
