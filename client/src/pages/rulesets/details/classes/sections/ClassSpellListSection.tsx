import { Box, MenuItem, TextField } from "@mui/material";
import { keepPreviousData, skipToken, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";

import { LoadMoreButton, SearchBar } from "@/client/src/components/common/index.ts";
import { SpellsIcon } from "@/client/src/components/icons/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  DescriptionCell,
  RulesetSectionTable,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import { classSpellListsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity } from "@/client/src/pages/rulesets/hooks/index.ts";
import { type rpc } from "@/client/src/services/rpc.ts";

import type { ClassSectionProps } from "./types.ts";

type Spell = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"], 200>["items"][number];

const COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

export function ClassSpellListSection({ rulesetId, classId, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const [selectedLevel, setSelectedLevel] = useState<number>(0);
  const [chosenListId, setChosenListId] = useState<string>();
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText);

  const { data: lists = [], isLoading: isLoadingLists } = useQuery(classSpellListsQuery(rulesetId, classId));
  // The class's own list opens first; one it casts from too (a pious templar's blackguard list) is picked
  const listId = lists.some((list) => list.id === chosenListId) ? chosenListId : lists[0]?.id;

  const spellsQuery = powersQuery(rulesetId, { search, childOnly: false, aptitudeId: listId, level: selectedLevel });
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...spellsQuery,
    queryFn: listId === undefined ? skipToken : spellsQuery.queryFn,
    placeholderData: listId === undefined ? undefined : keepPreviousData,
  });

  // Without a list the key is the ruleset's own "all lists" one, whose cached spells aren't this class's
  const spells = listId === undefined ? [] : pageItems(data);

  const handleRowClick = (spell: Spell) => {
    openEntity(`powers/${spell.id}/customization`);
  };

  const renderCell = (spell: Spell, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return spell.name;
      case "description":
        return <DescriptionCell text={spell.description} />;
      default:
        return null;
    }
  };

  return (
    <Box>
      <SearchBar
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Search spells..."
        filters={
          <>
            {lists.length > 1 && (
              <Box sx={{ width: { xs: "100%", sm: 200 } }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Spell list"
                  value={listId ?? ""}
                  onChange={(e) => setChosenListId(e.target.value)}
                >
                  {lists.map((list) => (
                    <MenuItem key={list.id} value={list.id}>
                      {list.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            )}
            <SpellLevelFilter value={selectedLevel} onChange={(level) => setSelectedLevel(Number(level))} />
          </>
        }
      />

      <RulesetSectionTable
        data={spells}
        search={search}
        isLoading={isLoadingLists || isLoading}
        columns={COLUMNS}
        onRowClick={handleRowClick}
        renderCell={renderCell}
        emptyIcon={SpellsIcon}
        emptyTitle="No spells"
        emptyDescription={
          lists.length === 0 && !isLoadingLists
            ? "This class has no spell list of its own."
            : "No spells found for this class at the selected level."
        }
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />
    </Box>
  );
}
