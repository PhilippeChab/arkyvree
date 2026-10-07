import { Box, MenuItem, Stack, TextField } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { LoadMoreButton, SearchBar } from "@/client/src/components/common/index.ts";
import { PowersIcon } from "@/client/src/components/icons/index.ts";
import { useSearchParam, useSearchText } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  DescriptionCell,
  RulesetSectionTable,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import {
  classSpellListsQuery,
  spellListSpellsQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { useOpenEntity, useSpellLevelFilter } from "@/client/src/pages/rulesets/hooks/index.ts";
import { type rpc } from "@/client/src/services/rpc.ts";

import type { ClassSectionProps } from "./types.ts";

type Spell = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"], 200>["items"][number];

const COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

export function ClassSpellListSection({ rulesetId, classId, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const { level, setLevel } = useSpellLevelFilter(false);
  const selectedLevel = level === "" ? 0 : level;
  const { value: chosenListId, setValue: setChosenListId } = useSearchParam("list");
  const { search, searchBarProps } = useSearchText();

  const {
    data: lists = [],
    isLoading: isLoadingLists,
    error: listsError,
  } = useQuery(classSpellListsQuery(rulesetId, classId));
  // The class's own list opens first; one it casts from too (a pious templar's blackguard list) is picked
  const listId = lists.some((list) => list.id === chosenListId) ? chosenListId : lists[0]?.id;

  // Another level or search keeps the list's spells showing; without a list there's nothing to keep
  function keepListSpells<T>(previous: T | undefined) {
    return listId === undefined ? undefined : keepPreviousData(previous);
  }

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...spellListSpellsQuery(rulesetId, listId, selectedLevel, search),
    placeholderData: keepListSpells,
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
    <Stack spacing={3}>
      <SearchBar
        {...searchBarProps}
        searchPlaceholder="Search spells…"
        filters={
          <>
            {lists.length > 1 && (
              <Box sx={{ width: { xs: "100%", sm: 200 } }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Spell List"
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
            <SpellLevelFilter value={selectedLevel} onChange={setLevel} />
          </>
        }
      />

      <Stack spacing={2}>
        <RulesetSectionTable
          what="Spells"
          error={listsError ?? error}
          data={spells}
          search={search}
          isLoading={isLoadingLists || isLoading}
          columns={COLUMNS}
          onRowClick={handleRowClick}
          renderCell={renderCell}
          emptyIcon={PowersIcon}
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
      </Stack>
    </Stack>
  );
}
